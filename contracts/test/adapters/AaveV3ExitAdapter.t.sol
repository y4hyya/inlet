// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {InletExit} from "../../src/InletExit.sol";
import {AaveV3ExitAdapter} from "../../src/adapters/AaveV3ExitAdapter.sol";
import {ExitIntent, ExitLeg} from "../../src/libraries/ExitTypes.sol";
import {CctpMessages} from "../CctpMessages.sol";
import {MockAavePool, MockAToken} from "../mocks/MockAave.sol";
import {MockTokenMessengerV2} from "../mocks/MockCctp.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract AaveV3ExitAdapterTest is Test {
    bytes32 constant AAVE_EXIT_ID = keccak256("aave-v3-exit:v1");
    bytes32 constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    MockUSDC usdc;
    MockAavePool pool;
    MockAToken aToken;
    MockTokenMessengerV2 messenger;
    InletExit exit;
    AaveV3ExitAdapter adapter;

    uint256 ownerKey = 0xA11CE;
    address owner;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new MockAavePool();
        aToken = pool.listReserve(address(usdc));
        messenger = new MockTokenMessengerV2();
        exit = new InletExit(address(usdc), address(messenger), address(this));
        adapter = new AaveV3ExitAdapter();
        exit.setAdapter(AAVE_EXIT_ID, address(adapter));

        owner = vm.addr(ownerKey);
        usdc.mint(owner, 10e6);
        vm.startPrank(owner);
        usdc.approve(address(pool), 10e6);
        pool.supply(address(usdc), 10e6, owner, 0);
        vm.stopPrank();
    }

    function _intent(address target, uint256 amount) internal view returns (ExitIntent memory) {
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = ExitLeg({domain: 6, recipient: CctpMessages.toBytes32(owner), amount: 4e6});
        legs[1] = ExitLeg({domain: 0, recipient: CctpMessages.toBytes32(owner), amount: 0});
        return ExitIntent({
            owner: owner,
            adapterId: AAVE_EXIT_ID,
            adapterData: abi.encode(target),
            amount: amount,
            minAssets: 10e6,
            legs: legs,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 days),
            maxFeeBps: 3
        });
    }

    function _permit(address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                IERC20Permit(address(aToken)).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        owner,
                        spender,
                        value,
                        IERC20Permit(address(aToken)).nonces(owner),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_executeWithdrawsTheAavePositionAndBurnsTheLegs() public {
        ExitIntent memory intent = _intent(address(pool), aToken.balanceOf(owner));
        bytes32 exitHash = exit.hashExit(intent);
        address executor = exit.exitAddress(exitHash);
        bytes memory signature = _permit(executor, intent.amount, intent.deadline);

        uint256 received = exit.execute(intent, signature);

        assertEq(received, 10e6);
        assertEq(aToken.balanceOf(owner), 0);
        assertEq(aToken.balanceOf(executor), 0);
        assertEq(aToken.allowance(owner, executor), 0);
        assertEq(messenger.burns(), 2);
        assertEq(messenger.last().amount, 6e6);
        assertEq(messenger.last().destinationDomain, 0);
        assertEq(usdc.balanceOf(executor), 0);
        assertEq(usdc.balanceOf(address(messenger)), 10e6);
        assertTrue(exit.executed(exitHash));
    }

    function test_poolWithoutTheUsdcReserveReverts() public {
        MockAavePool other = new MockAavePool();
        other.listReserve(address(0x1234));
        ExitIntent memory intent = _intent(address(other), aToken.balanceOf(owner));
        bytes memory signature =
            _permit(exit.exitAddress(exit.hashExit(intent)), intent.amount, intent.deadline);

        vm.expectRevert(AaveV3ExitAdapter.NoReserve.selector);
        exit.execute(intent, signature);
    }
}
