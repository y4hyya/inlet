// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InletReceiver} from "../src/InletReceiver.sol";
import {ERC4626Adapter} from "../src/adapters/ERC4626Adapter.sol";
import {InletTypes} from "../src/libraries/InletTypes.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockMessageTransmitterV2} from "./mocks/MockCctp.sol";
import {MockVault} from "./mocks/MockVault.sol";
import {FailingAdapter} from "./mocks/FailingAdapter.sol";
import {CctpMessages} from "./CctpMessages.sol";

contract InletReceiverTest is Test {
    uint32 constant ARC = 26;
    uint32 constant ARBITRUM_SEPOLIA = 3;

    MockUSDC usdc;
    MockMessageTransmitterV2 transmitter;
    InletReceiver receiver;
    MockVault vault;
    ERC4626Adapter adapter;
    FailingAdapter failing;

    address hub = address(0x4B);
    address beneficiary = address(0xBEEF);
    bytes32 constant ERC4626_ID = keccak256("erc4626:v1");
    bytes32 constant FAILING_ID = keccak256("failing:v1");

    function setUp() public {
        usdc = new MockUSDC();
        transmitter = new MockMessageTransmitterV2(usdc);
        receiver = new InletReceiver(address(usdc), address(transmitter), ARC, hub, address(this));
        vault = new MockVault(usdc);
        adapter = new ERC4626Adapter();
        failing = new FailingAdapter();
        receiver.setAdapter(ERC4626_ID, address(adapter));
        receiver.setAdapter(FAILING_ID, address(failing));
    }

    function _message(
        bytes32 nonce,
        uint32 sourceDomain,
        bytes32 messageSender,
        uint256 amount,
        uint256 feeExecuted,
        bytes32 intentHash,
        bytes32 adapterId,
        bytes memory adapterData
    ) internal view returns (bytes memory) {
        return _messageFor(
            beneficiary, nonce, sourceDomain, messageSender, amount, feeExecuted, intentHash, adapterId, adapterData
        );
    }

    function _messageFor(
        address beneficiary_,
        bytes32 nonce,
        uint32 sourceDomain,
        bytes32 messageSender,
        uint256 amount,
        uint256 feeExecuted,
        bytes32 intentHash,
        bytes32 adapterId,
        bytes memory adapterData
    ) internal view returns (bytes memory) {
        bytes memory payload = InletTypes.encodeHookPayload(
            intentHash, adapterId, CctpMessages.toBytes32(beneficiary_), adapterData
        );
        bytes memory body = CctpMessages.burnBody(
            CctpMessages.toBytes32(address(usdc)),
            CctpMessages.toBytes32(address(receiver)),
            amount,
            messageSender,
            0,
            feeExecuted,
            payload
        );
        return CctpMessages.header(
            sourceDomain,
            ARBITRUM_SEPOLIA,
            nonce,
            keccak256("token messenger on arc"),
            CctpMessages.toBytes32(address(receiver)),
            CctpMessages.toBytes32(address(receiver)),
            body
        );
    }

    function _vaultData(uint256 minShares) internal view returns (bytes memory) {
        return abi.encode(address(vault), minShares);
    }

    function test_receiveAndExecuteDepositsIntoVault() public {
        bytes32 intentHash = keccak256("intent 1");
        bytes memory message = _message(
            keccak256("nonce 1"),
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            intentHash,
            ERC4626_ID,
            _vaultData(0)
        );

        receiver.receiveAndExecute(message, "");

        assertEq(vault.balanceOf(beneficiary), 100e6);
        assertEq(vault.totalAssets(), 100e6);
        assertEq(usdc.balanceOf(address(receiver)), 0);
        assertTrue(receiver.executed(intentHash));
        assertEq(usdc.allowance(address(receiver), address(adapter)), 0);
    }

    function test_feeExecutedReducesTheDeposit() public {
        bytes memory message = _message(
            keccak256("nonce 3"),
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            10e6,
            keccak256("intent 3"),
            ERC4626_ID,
            _vaultData(0)
        );
        receiver.receiveAndExecute(message, "");
        assertEq(vault.balanceOf(beneficiary), 90e6);
    }

    function test_rejectsMessagesNotFromTheHub() public {
        bytes memory message = _message(
            keccak256("nonce 5"),
            ARC,
            CctpMessages.toBytes32(address(0xBAD)),
            100e6,
            0,
            keccak256("intent 5"),
            ERC4626_ID,
            _vaultData(0)
        );
        vm.expectRevert(InletReceiver.WrongOrigin.selector);
        receiver.receiveAndExecute(message, "");

        message = _message(
            keccak256("nonce 6"),
            7,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            keccak256("intent 6"),
            ERC4626_ID,
            _vaultData(0)
        );
        vm.expectRevert(InletReceiver.WrongOrigin.selector);
        receiver.receiveAndExecute(message, "");
    }

    function test_rejectsDuplicateIntent() public {
        bytes32 intentHash = keccak256("intent 7");
        receiver.receiveAndExecute(
            _message(keccak256("nonce 7"), ARC, CctpMessages.toBytes32(hub), 100e6, 0, intentHash, ERC4626_ID, _vaultData(0)),
            ""
        );
        bytes memory again = _message(
            keccak256("nonce 7 again"), ARC, CctpMessages.toBytes32(hub), 100e6, 0, intentHash, ERC4626_ID, _vaultData(0)
        );
        vm.expectRevert(InletReceiver.AlreadyExecuted.selector);
        receiver.receiveAndExecute(again, "");
        assertEq(vault.balanceOf(beneficiary), 100e6);
    }

    function test_failingAdapterMakesFundsClaimable() public {
        bytes32 intentHash = keccak256("intent 8");
        bytes memory message = _message(
            keccak256("nonce 8"),
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            intentHash,
            FAILING_ID,
            ""
        );
        receiver.receiveAndExecute(message, "");

        assertEq(receiver.claimable(beneficiary), 100e6);
        assertTrue(receiver.executed(intentHash));
        assertEq(usdc.balanceOf(address(receiver)), 100e6);

        vm.prank(beneficiary);
        receiver.claim(beneficiary);
        assertEq(usdc.balanceOf(beneficiary), 100e6);
        assertEq(receiver.claimable(beneficiary), 0);
    }

    function test_unknownAdapterMakesFundsClaimable() public {
        bytes memory message = _message(
            keccak256("nonce 9"),
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            keccak256("intent 9"),
            keccak256("missing:v1"),
            ""
        );
        receiver.receiveAndExecute(message, "");
        assertEq(receiver.claimable(beneficiary), 100e6);
    }

    function test_minSharesFailureFallsBackToClaimable() public {
        bytes memory message = _message(
            keccak256("nonce 10"),
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            keccak256("intent 10"),
            ERC4626_ID,
            _vaultData(101e6)
        );
        receiver.receiveAndExecute(message, "");
        assertEq(vault.balanceOf(beneficiary), 0);
        assertEq(receiver.claimable(beneficiary), 100e6);
    }

    function test_claimRevertsWithNothing() public {
        vm.expectRevert(InletReceiver.NothingToClaim.selector);
        receiver.claim(address(this));
    }

    function test_onlyTheReceiverCanConsumeItsMessages() public {
        bytes memory message = _message(
            keccak256("nonce 12"), ARC, CctpMessages.toBytes32(hub), 100e6, 0, keccak256("intent 12"), ERC4626_ID, _vaultData(0)
        );
        vm.expectRevert("Invalid caller for message");
        transmitter.receiveMessage(message, "");

        vm.prank(address(0x5E1A));
        receiver.receiveAndExecute(message, "");
        assertEq(vault.balanceOf(beneficiary), 100e6);
    }

    function test_forgedMessageCannotClaimTheReceiversBalance() public {
        bytes32 nonce = keccak256("nonce 11");
        receiver.receiveAndExecute(
            _message(nonce, ARC, CctpMessages.toBytes32(hub), 100e6, 0, keccak256("intent 11"), FAILING_ID, ""),
            ""
        );
        assertEq(usdc.balanceOf(address(receiver)), 100e6);

        address attacker = address(0xA77);
        bytes memory forged = _messageFor(
            attacker,
            nonce,
            ARC,
            CctpMessages.toBytes32(hub),
            100e6,
            0,
            keccak256("forged intent"),
            keccak256("missing:v1"),
            ""
        );
        vm.prank(attacker);
        (bool ok,) = address(receiver).call(abi.encodeWithSignature("execute(bytes)", forged));

        assertFalse(ok);
        assertEq(receiver.claimable(attacker), 0);
        assertEq(receiver.claimable(beneficiary), 100e6);
    }
}
