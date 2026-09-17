// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITokenMessengerV2, IMessageTransmitterV2} from "../../src/interfaces/ICctp.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice Records burns the way TokenMessengerV2 would and holds the burned USDC.
contract MockTokenMessengerV2 is ITokenMessengerV2 {
    struct Burn {
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
        bool withHook;
    }

    Burn internal _last;
    uint256 public burns;

    function last() external view returns (Burn memory) {
        return _last;
    }

    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external {
        _record(
            amount,
            destinationDomain,
            mintRecipient,
            burnToken,
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            "",
            false
        );
    }

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external {
        require(hookData.length > 0, "Hook data is empty");
        _record(
            amount,
            destinationDomain,
            mintRecipient,
            burnToken,
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            hookData,
            true
        );
    }

    function _record(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes memory hookData,
        bool withHook
    ) internal {
        require(maxFee < amount, "Max fee must be less than amount");
        IERC20(burnToken).transferFrom(msg.sender, address(this), amount);
        _last = Burn(
            amount,
            destinationDomain,
            mintRecipient,
            burnToken,
            destinationCaller,
            maxFee,
            minFinalityThreshold,
            hookData,
            withHook
        );
        burns++;
    }
}

/// @notice Marks nonces used and mints to the recipient the way MessageTransmitterV2 plus
/// TokenMessengerV2 would on a destination chain.
contract MockMessageTransmitterV2 is IMessageTransmitterV2 {
    MockUSDC public immutable usdc;
    mapping(bytes32 => uint256) public usedNonces;

    constructor(MockUSDC usdc_) {
        usdc = usdc_;
    }

    function receiveMessage(bytes calldata message, bytes calldata) external returns (bool) {
        bytes32 nonce = bytes32(message[12:44]);
        require(usedNonces[nonce] == 0, "Nonce already used");
        bytes32 destinationCaller = bytes32(message[108:140]);
        require(
            destinationCaller == bytes32(0) || destinationCaller == bytes32(uint256(uint160(msg.sender))),
            "Invalid caller for message"
        );
        usedNonces[nonce] = 1;
        bytes calldata body = message[148:];
        address recipient = address(uint160(uint256(bytes32(body[36:68]))));
        uint256 amount = uint256(bytes32(body[68:100]));
        uint256 fee = uint256(bytes32(body[164:196]));
        usdc.mint(recipient, amount - fee);
        return true;
    }
}
