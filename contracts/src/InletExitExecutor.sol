// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITokenMessengerV2} from "./interfaces/ICctp.sol";
import {IInletExit} from "./interfaces/IInletExit.sol";
import {IInletExitAdapter} from "./interfaces/IInletExitAdapter.sol";
import {ExitIntent, ExitLeg, ExitTypes} from "./libraries/ExitTypes.sol";

/// @notice Lives at an exit address. Redeems the position and burns the USDC toward every leg, all inside its constructor, so nothing can act through it afterwards.
contract InletExitExecutor {
    using SafeERC20 for IERC20;

    uint256 public immutable received;

    error TooFewAssets(uint256 received, uint256 minAssets);
    error BadLeg(uint256 index, uint256 amount, uint256 remaining);

    constructor() {
        IInletExit exit = IInletExit(msg.sender);
        (bytes memory data, bytes memory signature) = exit.pending();
        ExitIntent memory intent = abi.decode(data, (ExitIntent));
        address usdc = exit.usdc();

        uint256 got = _redeem(exit.adapters(intent.adapterId), usdc, intent, signature);
        if (got < intent.minAssets) revert TooFewAssets(got, intent.minAssets);
        received = got;

        _burn(exit.tokenMessenger(), usdc, intent, got);
    }

    function _redeem(
        address adapter,
        address usdc,
        ExitIntent memory intent,
        bytes memory signature
    ) internal returns (uint256) {
        (bool ok, bytes memory result) = adapter.delegatecall(
            abi.encodeCall(
                IInletExitAdapter.redeem,
                (usdc, intent.owner, intent.amount, intent.deadline, intent.adapterData, signature)
            )
        );
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        return abi.decode(result, (uint256));
    }

    function _burn(
        ITokenMessengerV2 messenger,
        address usdc,
        ExitIntent memory intent,
        uint256 remaining
    ) internal {
        uint256 count = intent.legs.length;
        for (uint256 i = 0; i < count; i++) {
            ExitLeg memory leg = intent.legs[i];
            uint256 amount = i + 1 == count ? remaining : leg.amount;
            if (amount == 0 || amount > remaining) revert BadLeg(i, amount, remaining);
            IERC20(usdc).forceApprove(address(messenger), amount);
            _depositForBurn(messenger, usdc, leg, amount, intent.maxFeeBps);
            remaining -= amount;
        }
    }

    function _depositForBurn(
        ITokenMessengerV2 messenger,
        address usdc,
        ExitLeg memory leg,
        uint256 amount,
        uint16 maxFeeBps
    ) internal {
        messenger.depositForBurn(
            amount,
            leg.domain,
            leg.recipient,
            usdc,
            bytes32(0),
            (amount * maxFeeBps) / 10_000,
            ExitTypes.FAST_FINALITY
        );
    }
}
