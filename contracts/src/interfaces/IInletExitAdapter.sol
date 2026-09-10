// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Runs by delegatecall inside an exit executor. Applies the owner's signature, pulls the position and turns it into USDC held by the executor.
interface IInletExitAdapter {
    function redeem(
        address usdc,
        address owner,
        uint256 amount,
        uint64 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external returns (uint256 received);
}
