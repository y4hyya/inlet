// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {ITokenMessengerV2} from "./interfaces/ICctp.sol";
import {ExitIntent, ExitTypes} from "./libraries/ExitTypes.sol";
import {InletExitExecutor} from "./InletExitExecutor.sol";

/// @notice The exit rail on a destination chain. Creates a one shot executor per intent that redeems the position and burns the USDC toward the chains the owner chose.
contract InletExit is Ownable, ReentrancyGuard, EIP712 {
    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;

    mapping(bytes32 adapterId => address adapter) public adapters;
    mapping(bytes32 exitHash => bool) public executed;

    bytes private _pendingIntent;
    bytes private _pendingSignature;

    event AdapterSet(bytes32 indexed adapterId, address adapter);
    event Exited(
        bytes32 indexed exitHash,
        address indexed owner,
        bytes32 indexed adapterId,
        address executor,
        uint256 received,
        uint256 legs
    );

    error IntentExpired();
    error NoLegs();
    error AlreadyExecuted();
    error UnknownAdapter();

    constructor(address usdc_, address tokenMessenger_, address owner_)
        Ownable(owner_)
        EIP712("InletExit", "1")
    {
        usdc = IERC20(usdc_);
        tokenMessenger = ITokenMessengerV2(tokenMessenger_);
    }

    function hashExit(ExitIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(ExitTypes.structHash(intent));
    }

    function exitAddress(bytes32 exitHash) public view returns (address) {
        return Create2.computeAddress(
            exitHash, keccak256(type(InletExitExecutor).creationCode), address(this)
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function pending() external view returns (bytes memory intent, bytes memory signature) {
        return (_pendingIntent, _pendingSignature);
    }

    function setAdapter(bytes32 adapterId, address adapter) external onlyOwner {
        adapters[adapterId] = adapter;
        emit AdapterSet(adapterId, adapter);
    }

    function execute(ExitIntent calldata intent, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 received)
    {
        if (block.timestamp > intent.deadline) revert IntentExpired();
        if (intent.legs.length == 0) revert NoLegs();
        if (adapters[intent.adapterId] == address(0)) revert UnknownAdapter();

        bytes32 exitHash = hashExit(intent);
        if (executed[exitHash]) revert AlreadyExecuted();
        executed[exitHash] = true;

        _pendingIntent = abi.encode(intent);
        _pendingSignature = signature;
        InletExitExecutor executor = new InletExitExecutor{salt: exitHash}();
        delete _pendingIntent;
        delete _pendingSignature;

        received = executor.received();
        emit Exited(
            exitHash,
            intent.owner,
            intent.adapterId,
            address(executor),
            received,
            intent.legs.length
        );
    }
}
