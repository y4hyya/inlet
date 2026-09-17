// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMessageTransmitterV2} from "./interfaces/ICctp.sol";
import {IInletAdapter} from "./interfaces/IInletAdapter.sol";
import {InletTypes} from "./libraries/InletTypes.sol";

/// @notice Mint recipient on EVM destinations. Executes the adapter named in the hook data, or keeps the funds claimable.
contract InletReceiver is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IMessageTransmitterV2 public immutable messageTransmitter;
    uint32 public immutable hubDomain;
    bytes32 public immutable hub;

    mapping(bytes32 adapterId => address adapter) public adapters;
    mapping(bytes32 intentHash => bool) public executed;
    mapping(address account => uint256 amount) public claimable;

    event AdapterSet(bytes32 indexed adapterId, address adapter);
    event Executed(
        bytes32 indexed intentHash,
        bytes32 indexed adapterId,
        address indexed beneficiary,
        uint256 amount,
        bytes result
    );
    event MadeClaimable(bytes32 indexed intentHash, address indexed beneficiary, uint256 amount);
    event Claimed(address indexed account, address indexed to, uint256 amount);

    error ReceiveFailed();
    error WrongRecipient();
    error WrongOrigin();
    error BadPayload();
    error AlreadyExecuted();
    error NothingToClaim();

    constructor(
        address usdc_,
        address messageTransmitter_,
        uint32 hubDomain_,
        address hub_,
        address owner_
    ) Ownable(owner_) {
        usdc = IERC20(usdc_);
        messageTransmitter = IMessageTransmitterV2(messageTransmitter_);
        hubDomain = hubDomain_;
        hub = bytes32(uint256(uint160(hub_)));
    }

    function setAdapter(bytes32 adapterId, address adapter) external onlyOwner {
        adapters[adapterId] = adapter;
        emit AdapterSet(adapterId, adapter);
    }

    function receiveAndExecute(bytes calldata message, bytes calldata attestation) external {
        if (!messageTransmitter.receiveMessage(message, attestation)) revert ReceiveFailed();
        _execute(message);
    }

    function claim(address to) external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        usdc.safeTransfer(to, amount);
        emit Claimed(msg.sender, to, amount);
    }

    function _execute(bytes calldata message) internal nonReentrant {
        // CCTP V2 header offsets: sourceDomain 4, body 148
        uint32 sourceDomain = uint32(bytes4(message[4:8]));

        // Burn body offsets: mintRecipient 36, amount 68, messageSender 100, feeExecuted 164, hookData 228
        bytes calldata body = message[148:];
        if (bytes32(body[36:68]) != bytes32(uint256(uint160(address(this))))) {
            revert WrongRecipient();
        }
        if (sourceDomain != hubDomain || bytes32(body[100:132]) != hub) revert WrongOrigin();

        uint256 received = uint256(bytes32(body[68:100])) - uint256(bytes32(body[164:196]));
        (
            bytes32 tag,
            bytes32 intentHash,
            bytes32 adapterId,
            bytes32 beneficiary,
            bytes memory adapterData
        ) = abi.decode(body[228:], (bytes32, bytes32, bytes32, bytes32, bytes));
        if (tag != InletTypes.HOOK_TAG) revert BadPayload();
        if (executed[intentHash]) revert AlreadyExecuted();
        executed[intentHash] = true;

        address beneficiaryAddress = address(uint160(uint256(beneficiary)));
        address adapter = adapters[adapterId];
        if (adapter != address(0)) {
            usdc.forceApprove(adapter, received);
            try IInletAdapter(adapter)
                .deposit(address(usdc), received, beneficiary, adapterData) returns (
                bytes memory result
            ) {
                usdc.forceApprove(adapter, 0);
                emit Executed(intentHash, adapterId, beneficiaryAddress, received, result);
                return;
            } catch {
                usdc.forceApprove(adapter, 0);
            }
        }

        claimable[beneficiaryAddress] += received;
        emit MadeClaimable(intentHash, beneficiaryAddress, received);
    }
}
