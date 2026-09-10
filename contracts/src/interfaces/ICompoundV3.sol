// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Subset of Compound III's Comet used by Inlet.
interface IComet {
    function baseToken() external view returns (address);

    function supplyTo(address dst, address asset, uint256 amount) external;

    function withdrawFrom(address src, address to, address asset, uint256 amount) external;

    function allowBySig(
        address owner,
        address manager,
        bool isAllowed,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function userNonce(address account) external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
}
