// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {ITokenMessengerV2} from "./interfaces/ICctp.sol";
import {DepositIntent, InletTypes} from "./libraries/InletTypes.sol";
import {InletForwarder} from "./InletForwarder.sol";

/// @notice The hub on Arc. Sweeps USDC from per intent deposit addresses through CCTP, or refunds it after the deadline.
contract InletHub is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using InletTypes for DepositIntent;

    enum Kind {
        None,
        Evm,
        StellarForwarder
    }

    enum Status {
        None,
        Swept,
        Refunded
    }

    struct Destination {
        Kind kind;
        bytes32 forwarder;
        uint16 maxFeeBps;
    }

    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    uint32 public immutable localDomain;

    mapping(uint32 domain => Destination) public destinations;
    mapping(uint32 domain => mapping(bytes32 receiver => bool)) public receivers;
    mapping(bytes32 receiver => bytes strkey) public strkeys;
    mapping(bytes32 intentHash => Status) public status;

    event DestinationSet(uint32 indexed domain, Kind kind, bytes32 forwarder, uint16 maxFeeBps);
    event ReceiverSet(uint32 indexed domain, bytes32 indexed receiver, bool allowed);
    event Swept(
        bytes32 indexed intentHash,
        uint32 indexed destinationDomain,
        uint256 amount,
        bytes32 mintRecipient
    );
    event Refunded(bytes32 indexed intentHash, uint32 indexed sourceDomain, uint256 amount);

    error FeeMustBeZero();
    error IntentExpired();
    error IntentNotExpired();
    error AlreadySwept();
    error UnknownDestination();
    error UnknownReceiver();
    error MissingStrkey();
    error NothingReceived();
    error InsufficientFunds(uint256 received, uint256 expected);

    constructor(address usdc_, address tokenMessenger_, uint32 localDomain_, address owner_)
        Ownable(owner_)
        EIP712("Inlet", "1")
    {
        usdc = IERC20(usdc_);
        tokenMessenger = ITokenMessengerV2(tokenMessenger_);
        localDomain = localDomain_;
    }

    function hashIntent(DepositIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(intent.structHash());
    }

    function depositAddress(bytes32 intentHash) public view returns (address) {
        return Create2.computeAddress(intentHash, _forwarderInitCodeHash(), address(this));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function setDestination(uint32 domain, Kind kind, bytes32 forwarder, uint16 maxFeeBps)
        external
        onlyOwner
    {
        destinations[domain] = Destination({kind: kind, forwarder: forwarder, maxFeeBps: maxFeeBps});
        emit DestinationSet(domain, kind, forwarder, maxFeeBps);
    }

    function setReceiver(uint32 domain, bytes32 receiver, bool allowed, bytes calldata strkey)
        external
        onlyOwner
    {
        receivers[domain][receiver] = allowed;
        if (strkey.length > 0) strkeys[receiver] = strkey;
        emit ReceiverSet(domain, receiver, allowed);
    }

    function sweep(DepositIntent calldata intent) external nonReentrant returns (uint256 routed) {
        if (intent.feeBps != 0) revert FeeMustBeZero();
        if (block.timestamp > intent.deadline) revert IntentExpired();

        bytes32 intentHash = hashIntent(intent);
        if (status[intentHash] != Status.None) revert AlreadySwept();

        Destination memory destination = destinations[intent.destinationDomain];
        if (destination.kind == Kind.None) revert UnknownDestination();
        if (!receivers[intent.destinationDomain][intent.receiver]) revert UnknownReceiver();

        status[intentHash] = Status.Swept;

        routed = _collect(intentHash);
        if (routed < intent.amount) revert InsufficientFunds(routed, intent.amount);

        bytes memory payload = InletTypes.encodeHookPayload(
            intentHash, intent.adapterId, intent.beneficiary, intent.adapterData
        );

        bytes32 mintRecipient;
        bytes memory hookData;
        if (destination.kind == Kind.Evm) {
            mintRecipient = intent.receiver;
            hookData = payload;
        } else {
            bytes memory strkey = strkeys[intent.receiver];
            if (strkey.length == 0) revert MissingStrkey();
            mintRecipient = destination.forwarder;
            hookData = InletTypes.encodeStellarHook(strkey, payload);
        }

        uint256 maxFee = (routed * destination.maxFeeBps) / 10_000;
        usdc.forceApprove(address(tokenMessenger), routed);
        tokenMessenger.depositForBurnWithHook(
            routed,
            intent.destinationDomain,
            mintRecipient,
            address(usdc),
            mintRecipient,
            maxFee,
            InletTypes.STANDARD_FINALITY,
            hookData
        );

        emit Swept(intentHash, intent.destinationDomain, routed, mintRecipient);
    }

    function refund(DepositIntent calldata intent)
        external
        nonReentrant
        returns (uint256 refunded)
    {
        if (block.timestamp <= intent.deadline) {
            revert IntentNotExpired();
        }

        bytes32 intentHash = hashIntent(intent);
        if (status[intentHash] == Status.None) status[intentHash] = Status.Refunded;

        refunded = _collect(intentHash);
        if (refunded == 0) revert NothingReceived();

        Destination memory source = destinations[intent.sourceDomain];
        uint256 maxFee = (refunded * source.maxFeeBps) / 10_000;
        usdc.forceApprove(address(tokenMessenger), refunded);
        tokenMessenger.depositForBurn(
            refunded,
            intent.sourceDomain,
            intent.refundRecipient,
            address(usdc),
            bytes32(0),
            maxFee,
            InletTypes.STANDARD_FINALITY
        );

        emit Refunded(intentHash, intent.sourceDomain, refunded);
    }

    function _collect(bytes32 intentHash) internal returns (uint256 received) {
        uint256 before = usdc.balanceOf(address(this));
        address forwarder = depositAddress(intentHash);
        if (forwarder.code.length == 0) {
            new InletForwarder{salt: intentHash}(address(usdc));
        } else {
            InletForwarder(forwarder).flush();
        }
        received = usdc.balanceOf(address(this)) - before;
    }

    function _forwarderInitCodeHash() internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(type(InletForwarder).creationCode, abi.encode(address(usdc)))
            );
    }
}
