// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IComet} from "../interfaces/ICompoundV3.sol";
import {IInletExitAdapter} from "../interfaces/IInletExitAdapter.sol";
import {ExitTypes} from "../libraries/ExitTypes.sol";

/// @notice Withdraws the owner's Compound III base balance after an allowBySig that names the executor as manager. Runs by delegatecall inside the executor. Adapter data is abi.encode(comet).
contract CompoundV3ExitAdapter is IInletExitAdapter {
    error WrongAsset();

    function redeem(
        address usdc,
        address owner,
        uint256 amount,
        uint64 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external returns (uint256 received) {
        address comet = abi.decode(data, (address));
        if (IComet(comet).baseToken() != usdc) revert WrongAsset();

        _allow(comet, owner, deadline, signature);

        uint256 before = IERC20(usdc).balanceOf(address(this));
        IComet(comet).withdrawFrom(owner, address(this), usdc, amount);
        received = IERC20(usdc).balanceOf(address(this)) - before;
    }

    function _allow(address comet, address owner, uint64 deadline, bytes calldata signature)
        internal
    {
        (uint8 v, bytes32 r, bytes32 s) = ExitTypes.split(signature);
        IComet(comet)
            .allowBySig(
                owner, address(this), true, IComet(comet).userNonce(owner), deadline, v, r, s
            );
    }
}
