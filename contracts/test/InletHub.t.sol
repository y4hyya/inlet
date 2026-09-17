// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InletHub} from "../src/InletHub.sol";
import {InletForwarder} from "../src/InletForwarder.sol";
import {DepositIntent, InletTypes} from "../src/libraries/InletTypes.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockTokenMessengerV2} from "./mocks/MockCctp.sol";
import {CctpMessages} from "./CctpMessages.sol";

contract InletHubTest is Test {
    uint32 constant ARC = 26;
    uint32 constant BASE_SEPOLIA = 6;
    uint32 constant ARBITRUM_SEPOLIA = 3;
    uint32 constant STELLAR = 27;

    MockUSDC usdc;
    MockTokenMessengerV2 messenger;
    InletHub hub;

    address evmReceiver = address(0xEC01);
    bytes32 stellarReceiver = keccak256("stellar receiver");
    bytes32 stellarForwarder = keccak256("cctp forwarder");
    bytes strkey = bytes("CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4EXAMPLE");
    address user = address(0xBEEF);

    function setUp() public {
        usdc = new MockUSDC();
        messenger = new MockTokenMessengerV2();
        hub = new InletHub(address(usdc), address(messenger), ARC, address(this));

        hub.setDestination(ARBITRUM_SEPOLIA, InletHub.Kind.Evm, bytes32(0), 0);
        hub.setReceiver(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), true, "");
        hub.setDestination(STELLAR, InletHub.Kind.StellarForwarder, stellarForwarder, 0);
        hub.setReceiver(STELLAR, stellarReceiver, true, strkey);
        hub.setDestination(BASE_SEPOLIA, InletHub.Kind.Evm, bytes32(0), 0);
    }

    function _intent(uint32 destinationDomain, bytes32 receiver, uint256 amount)
        internal
        view
        returns (DepositIntent memory intent)
    {
        intent = DepositIntent({
            owner: user,
            sourceDomain: BASE_SEPOLIA,
            destinationDomain: destinationDomain,
            adapterId: keccak256("erc4626:v1"),
            receiver: receiver,
            beneficiary: CctpMessages.toBytes32(user),
            adapterData: abi.encode(address(0x4626), uint256(0)),
            amount: amount,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 days),
            refundRecipient: CctpMessages.toBytes32(user),
            feeBps: 0
        });
    }

    function test_depositAddressIsDeterministic() public view {
        DepositIntent memory a =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        DepositIntent memory b =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        DepositIntent memory c =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 101e6);
        assertEq(hub.depositAddress(hub.hashIntent(a)), hub.depositAddress(hub.hashIntent(b)));
        assertTrue(hub.depositAddress(hub.hashIntent(a)) != hub.depositAddress(hub.hashIntent(c)));
    }

    function test_sweepRoutesFundsToEvmReceiverWithInletHook() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        bytes32 intentHash = hub.hashIntent(intent);
        usdc.mint(hub.depositAddress(intentHash), 100e6);

        uint256 routed = hub.sweep(intent);

        assertEq(routed, 100e6);
        assertEq(uint8(hub.status(intentHash)), uint8(InletHub.Status.Swept));
        assertEq(usdc.balanceOf(address(hub)), 0);
        assertEq(usdc.balanceOf(hub.depositAddress(intentHash)), 0);

        MockTokenMessengerV2.Burn memory burn = messenger.last();
        assertEq(burn.amount, 100e6);
        assertEq(burn.destinationDomain, ARBITRUM_SEPOLIA);
        assertEq(burn.mintRecipient, CctpMessages.toBytes32(evmReceiver));
        assertEq(burn.destinationCaller, CctpMessages.toBytes32(evmReceiver));
        assertEq(burn.maxFee, 0);
        assertEq(burn.minFinalityThreshold, 2000);
        assertTrue(burn.withHook);

        (
            bytes32 tag,
            bytes32 hookIntent,
            bytes32 adapterId,
            bytes32 beneficiary,
            bytes memory adapterData
        ) = abi.decode(burn.hookData, (bytes32, bytes32, bytes32, bytes32, bytes));
        assertEq(tag, InletTypes.HOOK_TAG);
        assertEq(hookIntent, intentHash);
        assertEq(adapterId, intent.adapterId);
        assertEq(beneficiary, intent.beneficiary);
        assertEq(keccak256(adapterData), keccak256(intent.adapterData));
    }

    function test_sweepRoutesFullBalanceWhenOverfunded() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        usdc.mint(hub.depositAddress(hub.hashIntent(intent)), 150e6);
        assertEq(hub.sweep(intent), 150e6);
        assertEq(messenger.last().amount, 150e6);
    }

    function test_sweepToStellarWrapsPayloadInForwarderFrame() public {
        DepositIntent memory intent = _intent(STELLAR, stellarReceiver, 25e6);
        bytes32 intentHash = hub.hashIntent(intent);
        usdc.mint(hub.depositAddress(intentHash), 25e6);

        hub.sweep(intent);

        MockTokenMessengerV2.Burn memory burn = messenger.last();
        assertEq(burn.mintRecipient, stellarForwarder);
        assertEq(burn.destinationCaller, stellarForwarder);
        bytes memory payload = InletTypes.encodeHookPayload(
            intentHash, intent.adapterId, intent.beneficiary, intent.adapterData
        );
        bytes memory expected = InletTypes.encodeStellarHook(strkey, payload);
        assertEq(keccak256(burn.hookData), keccak256(expected));
        for (uint256 i = 0; i < 24; i++) {
            assertEq(burn.hookData[i], bytes1(0));
        }
        assertEq(uint32(bytes4(_slice(burn.hookData, 28, 4))), uint32(strkey.length));
    }

    function test_sweepRevertsWhenUnderfunded() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        usdc.mint(hub.depositAddress(hub.hashIntent(intent)), 99e6);
        vm.expectRevert(abi.encodeWithSelector(InletHub.InsufficientFunds.selector, 99e6, 100e6));
        hub.sweep(intent);
    }

    function test_sweepRevertsOnSecondCall() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        usdc.mint(hub.depositAddress(hub.hashIntent(intent)), 100e6);
        hub.sweep(intent);
        vm.expectRevert(InletHub.AlreadySwept.selector);
        hub.sweep(intent);
    }

    function test_sweepRevertsAfterDeadline() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        usdc.mint(hub.depositAddress(hub.hashIntent(intent)), 100e6);
        vm.warp(intent.deadline + 1);
        vm.expectRevert(InletHub.IntentExpired.selector);
        hub.sweep(intent);
    }

    function test_sweepRevertsWhenFeeIsNotZero() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        intent.feeBps = 5;
        vm.expectRevert(InletHub.FeeMustBeZero.selector);
        hub.sweep(intent);
    }

    function test_sweepRevertsForUnknownDestinationOrReceiver() public {
        DepositIntent memory intent = _intent(99, CctpMessages.toBytes32(evmReceiver), 100e6);
        vm.expectRevert(InletHub.UnknownDestination.selector);
        hub.sweep(intent);

        intent = _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(address(0xBAD)), 100e6);
        vm.expectRevert(InletHub.UnknownReceiver.selector);
        hub.sweep(intent);
    }

    function test_refundAfterDeadlineBurnsBackToSource() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        bytes32 intentHash = hub.hashIntent(intent);
        usdc.mint(hub.depositAddress(intentHash), 100e6);
        vm.warp(intent.deadline + 1);

        uint256 refunded = hub.refund(intent);

        assertEq(refunded, 100e6);
        assertEq(uint8(hub.status(intentHash)), uint8(InletHub.Status.Refunded));
        MockTokenMessengerV2.Burn memory burn = messenger.last();
        assertEq(burn.destinationDomain, BASE_SEPOLIA);
        assertEq(burn.mintRecipient, intent.refundRecipient);
        assertFalse(burn.withHook);
    }

    function test_refundRevertsBeforeDeadline() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        usdc.mint(hub.depositAddress(hub.hashIntent(intent)), 100e6);
        vm.expectRevert(InletHub.IntentNotExpired.selector);
        hub.refund(intent);
    }

    function test_refundRevertsWhenNothingArrived() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        vm.warp(intent.deadline + 1);
        vm.expectRevert(InletHub.NothingReceived.selector);
        hub.refund(intent);
    }

    function test_lateFundsAfterSweepCanBeRefunded() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        bytes32 intentHash = hub.hashIntent(intent);
        address forwarder = hub.depositAddress(intentHash);
        usdc.mint(forwarder, 100e6);
        hub.sweep(intent);
        assertTrue(forwarder.code.length > 0);

        usdc.mint(forwarder, 7e6);
        vm.warp(intent.deadline + 1);
        assertEq(hub.refund(intent), 7e6);
        assertEq(uint8(hub.status(intentHash)), uint8(InletHub.Status.Swept));
        assertEq(messenger.last().amount, 7e6);
    }

    function test_forwarderFlushOnlyByHub() public {
        DepositIntent memory intent =
            _intent(ARBITRUM_SEPOLIA, CctpMessages.toBytes32(evmReceiver), 100e6);
        address forwarder = hub.depositAddress(hub.hashIntent(intent));
        usdc.mint(forwarder, 100e6);
        hub.sweep(intent);
        vm.expectRevert(InletForwarder.OnlyHub.selector);
        InletForwarder(forwarder).flush();
    }

    function _slice(bytes memory data, uint256 start, uint256 length)
        internal
        pure
        returns (bytes memory out)
    {
        out = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            out[i] = data[start + i];
        }
    }
}
