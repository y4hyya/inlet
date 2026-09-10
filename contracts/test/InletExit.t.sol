// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {InletExit} from "../src/InletExit.sol";
import {InletExitExecutor} from "../src/InletExitExecutor.sol";
import {ERC4626ExitAdapter} from "../src/adapters/ERC4626ExitAdapter.sol";
import {ITokenMessengerV2} from "../src/interfaces/ICctp.sol";
import {ExitIntent, ExitLeg} from "../src/libraries/ExitTypes.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockTokenMessengerV2} from "./mocks/MockCctp.sol";
import {MockVault} from "./mocks/MockVault.sol";
import {CctpMessages} from "./CctpMessages.sol";

contract InletExitTest is Test {
    bytes32 constant EXIT_ID = keccak256("erc4626-exit:v1");
    bytes32 constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    string constant FIXTURE = "./test/fixtures/exit-hash.json";

    MockUSDC usdc;
    MockTokenMessengerV2 messenger;
    MockVault vault;
    InletExit exit;
    ERC4626ExitAdapter adapter;

    uint256 ownerKey = 0xA11CE;
    address owner;

    function setUp() public {
        usdc = new MockUSDC();
        messenger = new MockTokenMessengerV2();
        vault = new MockVault(usdc);
        exit = new InletExit(address(usdc), address(messenger), address(this));
        adapter = new ERC4626ExitAdapter();
        exit.setAdapter(EXIT_ID, address(adapter));

        owner = vm.addr(ownerKey);
        usdc.mint(owner, 10e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        vault.deposit(10e6, owner);
        vm.stopPrank();
    }

    function _leg(uint32 domain, uint256 amount) internal view returns (ExitLeg memory) {
        return ExitLeg({domain: domain, recipient: CctpMessages.toBytes32(owner), amount: amount});
    }

    function _twoLegs() internal view returns (ExitLeg[] memory legs) {
        legs = new ExitLeg[](2);
        legs[0] = _leg(6, 4e6);
        legs[1] = _leg(0, 0);
    }

    function _withLegs(uint256 shares, ExitLeg[] memory legs)
        internal
        view
        returns (ExitIntent memory intent)
    {
        intent = ExitIntent({
            owner: owner,
            adapterId: EXIT_ID,
            adapterData: abi.encode(address(vault)),
            amount: shares,
            minAssets: 10e6 - 1,
            legs: legs,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 days),
            maxFeeBps: 3
        });
    }

    function _intent(uint256 shares) internal view returns (ExitIntent memory) {
        return _withLegs(shares, _twoLegs());
    }

    function _executorFor(ExitIntent memory intent) internal view returns (address) {
        return exit.exitAddress(exit.hashExit(intent));
    }

    function _permit(address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                IERC20Permit(address(vault)).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        owner,
                        spender,
                        value,
                        IERC20Permit(address(vault)).nonces(owner),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sign(ExitIntent memory intent) internal view returns (bytes memory) {
        return _permit(_executorFor(intent), intent.amount, intent.deadline);
    }

    function test_executeRedeemsAndBurnsOneMessagePerLeg() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        bytes32 exitHash = exit.hashExit(intent);
        address executor = exit.exitAddress(exitHash);
        bytes memory signature = _permit(executor, intent.amount, intent.deadline);

        uint256 received = exit.execute(intent, signature);

        assertEq(received, 10e6);
        assertEq(vault.balanceOf(owner), 0);
        assertEq(messenger.burns(), 2);
        MockTokenMessengerV2.Burn memory last = messenger.last();
        assertEq(last.amount, 6e6);
        assertEq(last.destinationDomain, 0);
        assertEq(last.maxFee, (6e6 * 3) / 10_000);
        assertEq(last.minFinalityThreshold, 1000);
        assertEq(usdc.balanceOf(executor), 0);
        assertTrue(exit.executed(exitHash));
        assertGt(executor.code.length, 0);
    }

    function test_exitAddressIsDeterministic() public view {
        assertEq(_executorFor(_intent(10e6)), _executorFor(_intent(10e6)));
    }

    function test_exitAddressChangesWhenAnyFieldChanges() public view {
        address base = _executorFor(_intent(10e6));

        ExitIntent memory intent = _intent(10e6);
        intent.owner = address(0xB0B);
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.adapterId = keccak256("aave-v3-exit:v1");
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.adapterData = abi.encode(address(0xDEAD));
        assertTrue(_executorFor(intent) != base);

        assertTrue(_executorFor(_intent(9e6)) != base);

        intent = _intent(10e6);
        intent.minAssets = 1;
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.legs[0].domain = 7;
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.legs[0].recipient = CctpMessages.toBytes32(address(0xB0B));
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.legs[0].amount = 3e6;
        assertTrue(_executorFor(intent) != base);

        ExitLeg[] memory one = new ExitLeg[](1);
        one[0] = _leg(0, 0);
        assertTrue(_executorFor(_withLegs(10e6, one)) != base);

        intent = _intent(10e6);
        intent.nonce = 2;
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.deadline = uint64(block.timestamp + 2 days);
        assertTrue(_executorFor(intent) != base);

        intent = _intent(10e6);
        intent.maxFeeBps = 4;
        assertTrue(_executorFor(intent) != base);
    }

    function test_permitSignedForAnotherIntentReverts() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = _leg(6, 5e6);
        legs[1] = _leg(0, 0);
        ExitIntent memory other = _withLegs(intent.amount, legs);
        bytes memory signature = _permit(_executorFor(other), intent.amount, intent.deadline);

        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        exit.execute(intent, signature);
    }

    function test_replayRevertsAlreadyExecuted() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        bytes memory signature = _sign(intent);
        exit.execute(intent, signature);

        vm.expectRevert(InletExit.AlreadyExecuted.selector);
        exit.execute(intent, signature);
    }

    function test_expiredIntentReverts() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        bytes memory signature = _sign(intent);
        vm.warp(intent.deadline + 1);

        vm.expectRevert(InletExit.IntentExpired.selector);
        exit.execute(intent, signature);
    }

    function test_noLegsReverts() public {
        ExitIntent memory intent = _withLegs(vault.balanceOf(owner), new ExitLeg[](0));
        bytes memory signature = _sign(intent);

        vm.expectRevert(InletExit.NoLegs.selector);
        exit.execute(intent, signature);
    }

    function test_unknownAdapterReverts() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        intent.adapterId = keccak256("nothing:v1");
        bytes memory signature = _sign(intent);

        vm.expectRevert(InletExit.UnknownAdapter.selector);
        exit.execute(intent, signature);
    }

    function test_minAssetsAboveTheRedeemReverts() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        intent.minAssets = 10e6 + 1;
        bytes memory signature = _sign(intent);

        vm.expectRevert(
            abi.encodeWithSelector(InletExitExecutor.TooFewAssets.selector, 10e6, 10e6 + 1)
        );
        exit.execute(intent, signature);
    }

    function test_fixedLegLargerThanTheRemainderReverts() public {
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = _leg(6, 11e6);
        legs[1] = _leg(0, 0);
        ExitIntent memory intent = _withLegs(vault.balanceOf(owner), legs);
        bytes memory signature = _sign(intent);

        vm.expectRevert(
            abi.encodeWithSelector(InletExitExecutor.BadLeg.selector, uint256(0), 11e6, 10e6)
        );
        exit.execute(intent, signature);
    }

    function test_fixedLegOfZeroReverts() public {
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = _leg(6, 0);
        legs[1] = _leg(0, 0);
        ExitIntent memory intent = _withLegs(vault.balanceOf(owner), legs);
        bytes memory signature = _sign(intent);

        vm.expectRevert(
            abi.encodeWithSelector(InletExitExecutor.BadLeg.selector, uint256(0), 0, 10e6)
        );
        exit.execute(intent, signature);
    }

    function test_singleLegTakesEverything() public {
        ExitLeg[] memory legs = new ExitLeg[](1);
        legs[0] = _leg(0, 0);
        ExitIntent memory intent = _withLegs(vault.balanceOf(owner), legs);

        assertEq(exit.execute(intent, _sign(intent)), 10e6);
        assertEq(messenger.burns(), 1);
        assertEq(messenger.last().amount, 10e6);
        assertEq(messenger.last().destinationDomain, 0);
    }

    function test_lastOfThreeLegsTakesTheRemainder() public {
        ExitLeg[] memory legs = new ExitLeg[](3);
        legs[0] = _leg(6, 3e6);
        legs[1] = _leg(3, 2e6);
        legs[2] = _leg(0, 0);
        ExitIntent memory intent = _withLegs(vault.balanceOf(owner), legs);

        exit.execute(intent, _sign(intent));

        assertEq(messenger.burns(), 3);
        assertEq(messenger.last().amount, 5e6);
        assertEq(messenger.last().destinationDomain, 0);
        assertEq(usdc.balanceOf(address(messenger)), 10e6);
    }

    function test_maxFeePerLegIsTheAmountTimesMaxFeeBps() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        bytes memory signature = _sign(intent);

        vm.expectCall(
            address(messenger),
            abi.encodeCall(
                ITokenMessengerV2.depositForBurn,
                (
                    uint256(4e6),
                    uint32(6),
                    CctpMessages.toBytes32(owner),
                    address(usdc),
                    bytes32(0),
                    uint256((4e6 * 3) / 10_000),
                    uint32(1000)
                )
            )
        );
        vm.expectCall(
            address(messenger),
            abi.encodeCall(
                ITokenMessengerV2.depositForBurn,
                (
                    uint256(6e6),
                    uint32(0),
                    CctpMessages.toBytes32(owner),
                    address(usdc),
                    bytes32(0),
                    uint256((6e6 * 3) / 10_000),
                    uint32(1000)
                )
            )
        );
        exit.execute(intent, signature);
    }

    function test_exitedEventCarriesTheExecutorAndTotals() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        bytes32 exitHash = exit.hashExit(intent);
        address executor = exit.exitAddress(exitHash);
        bytes memory signature = _permit(executor, intent.amount, intent.deadline);

        vm.expectEmit(true, true, true, true, address(exit));
        emit InletExit.Exited(exitHash, owner, EXIT_ID, executor, 10e6, 2);
        exit.execute(intent, signature);
    }

    function test_pendingIsEmptyAfterExecute() public {
        ExitIntent memory intent = _intent(vault.balanceOf(owner));
        exit.execute(intent, _sign(intent));

        (bytes memory data, bytes memory signature) = exit.pending();
        assertEq(data.length, 0);
        assertEq(signature.length, 0);
    }

    function test_writesHashFixture() public {
        vm.chainId(84532);
        address verifying = 0x1111111111111111111111111111111111111111;
        deployCodeTo(
            "InletExit.sol:InletExit",
            abi.encode(address(usdc), address(messenger), address(this)),
            verifying
        );
        InletExit fixed_ = InletExit(verifying);

        address fixtureOwner = 0x31b1610Ec633Ed09Ce15dfDf697DD631daa3Bd02;
        bytes32 recipient = CctpMessages.toBytes32(fixtureOwner);
        ExitLeg[] memory legs = new ExitLeg[](2);
        legs[0] = ExitLeg({domain: 6, recipient: recipient, amount: 400_000});
        legs[1] = ExitLeg({domain: 0, recipient: recipient, amount: 0});
        ExitIntent memory intent = ExitIntent({
            owner: fixtureOwner,
            adapterId: EXIT_ID,
            adapterData: abi.encode(address(0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED)),
            amount: 1_000_000,
            minAssets: 999_000,
            legs: legs,
            nonce: 42,
            deadline: 1_800_000_000,
            maxFeeBps: 3
        });
        bytes32 exitHash = fixed_.hashExit(intent);

        string memory root = "exit";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "verifyingContract", verifying);
        vm.serializeBytes32(root, "hash", exitHash);
        vm.serializeAddress(root, "owner", intent.owner);
        vm.serializeBytes32(root, "adapterId", intent.adapterId);
        vm.serializeBytes(root, "adapterData", intent.adapterData);
        vm.serializeUint(root, "amount", intent.amount);
        vm.serializeUint(root, "minAssets", intent.minAssets);
        vm.serializeUint(root, "nonce", intent.nonce);
        vm.serializeUint(root, "deadline", uint256(intent.deadline));
        vm.serializeUint(root, "maxFeeBps", uint256(intent.maxFeeBps));

        string[] memory encoded = new string[](legs.length);
        for (uint256 i = 0; i < legs.length; i++) {
            string memory key = string.concat("leg", vm.toString(i));
            vm.serializeUint(key, "domain", uint256(legs[i].domain));
            vm.serializeBytes32(key, "recipient", legs[i].recipient);
            encoded[i] = vm.serializeUint(key, "amount", legs[i].amount);
        }
        vm.writeJson(vm.serializeString(root, "legs", encoded), FIXTURE);

        assertEq(vm.parseJsonBytes32(vm.readFile(FIXTURE), ".hash"), exitHash);
    }
}
