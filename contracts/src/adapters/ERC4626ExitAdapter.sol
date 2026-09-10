// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {IInletExitAdapter} from "../interfaces/IInletExitAdapter.sol";
import {ExitTypes} from "../libraries/ExitTypes.sol";

/// @notice Redeems shares of any ERC 4626 vault over USDC that supports EIP 2612. Runs by delegatecall inside the executor. Adapter data is abi.encode(vault).
contract ERC4626ExitAdapter is IInletExitAdapter {
    error WrongAsset();

    function redeem(
        address usdc,
        address owner,
        uint256 shares,
        uint64 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external returns (uint256 received) {
        address vault = abi.decode(data, (address));
        if (IERC4626(vault).asset() != usdc) revert WrongAsset();

        _permit(vault, owner, shares, deadline, signature);

        uint256 before = IERC20(usdc).balanceOf(address(this));
        IERC4626(vault).redeem(shares, address(this), owner);
        received = IERC20(usdc).balanceOf(address(this)) - before;
    }

    function _permit(
        address vault,
        address owner,
        uint256 shares,
        uint64 deadline,
        bytes calldata signature
    ) internal {
        (uint8 v, bytes32 r, bytes32 s) = ExitTypes.split(signature);
        IERC20Permit(vault).permit(owner, address(this), shares, deadline, v, r, s);
    }
}
