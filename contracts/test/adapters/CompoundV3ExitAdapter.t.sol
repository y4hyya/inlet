// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InletExit} from "../../src/InletExit.sol";
import {CompoundV3ExitAdapter} from "../../src/adapters/CompoundV3ExitAdapter.sol";
import {ExitIntent, ExitLeg} from "../../src/libraries/ExitTypes.sol";
import {CctpMessages} from "../CctpMessages.sol";
import {MockComet} from "../mocks/MockComet.sol";
import {MockTokenMessengerV2} from "../mocks/MockCctp.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract CompoundV3ExitAdapterTest is Test {
    bytes32 constant COMPOUND_EXIT_ID = keccak256("compound-v3-exit:v1");
    bytes32 constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 constant AUTHORIZATION_TYPEHASH = keccak256(
        "Authorization(address owner,address manager,bool isAllowed,uint256 nonce,uint256 expiry)"
    );

    MockUSDC usdc;
    MockComet comet;
    MockTokenMessengerV2 messenger;
    InletExit exit;
    CompoundV3ExitAdapter adapter;

    uint256 ownerKey = 0xA11CE;
    address owner;

    function setUp() public {
        usdc = new MockUSDC();
        comet = new MockComet(address(usdc));
        messenger = new MockTokenMessengerV2();
        exit = new InletExit(address(usdc), address(messenger), address(this));
        adapter = new CompoundV3ExitAdapter();
        exit.setAdapter(COMPOUND_EXIT_ID, address(adapter));

        owner = vm.addr(ownerKey);
        usdc.mint(owner, 10e6);
        vm.startPrank(owner);
        usdc.approve(address(comet), 10e6);
        comet.supplyTo(owner, address(usdc), 10e6);
        vm.stopPrank();
    }

    function _intent(address target, uint256 amount) internal view returns (ExitIntent memory) {
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = ExitLeg({domain: 3, recipient: CctpMessages.toBytes32(owner), amount: 4e6});
        legs[1] = ExitLeg({domain: 0, recipient: CctpMessages.toBytes32(owner), amount: 0});
        return ExitIntent({
            owner: owner,
            adapterId: COMPOUND_EXIT_ID,
            adapterData: abi.encode(target),
            amount: amount,
            minAssets: 10e6,
            legs: legs,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 days),
            maxFeeBps: 3
        });
    }

    function _authorization(MockComet target, address manager, uint256 expiry)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(target.name())),
                keccak256(bytes(target.version())),
                block.chainid,
                address(target)
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        AUTHORIZATION_TYPEHASH,
                        owner,
                        manager,
                        true,
                        target.userNonce(owner),
                        expiry
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_executeWithdrawsTheCompoundPositionAndBurnsTheLegs() public {
        ExitIntent memory intent = _intent(address(comet), comet.balanceOf(owner));
        bytes32 exitHash = exit.hashExit(intent);
        address executor = exit.exitAddress(exitHash);
        bytes memory signature = _authorization(comet, executor, intent.deadline);

        uint256 received = exit.execute(intent, signature);

        assertEq(received, 10e6);
        assertEq(comet.balanceOf(owner), 0);
        assertEq(comet.userNonce(owner), 1);
        assertTrue(comet.isAllowed(owner, executor));
        assertEq(messenger.burns(), 2);
        assertEq(messenger.last().amount, 6e6);
        assertEq(messenger.last().destinationDomain, 0);
        assertEq(usdc.balanceOf(executor), 0);
        assertEq(usdc.balanceOf(address(messenger)), 10e6);
        assertTrue(exit.executed(exitHash));
    }

    function test_cometWithAnotherBaseTokenReverts() public {
        MockComet other = new MockComet(address(0x1234));
        ExitIntent memory intent = _intent(address(other), comet.balanceOf(owner));
        bytes memory signature =
            _authorization(other, exit.exitAddress(exit.hashExit(intent)), intent.deadline);

        vm.expectRevert(CompoundV3ExitAdapter.WrongAsset.selector);
        exit.execute(intent, signature);
    }
}
