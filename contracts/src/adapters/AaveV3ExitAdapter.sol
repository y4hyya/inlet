// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAaveV3Pool} from "../interfaces/IAaveV3.sol";
import {IInletExitAdapter} from "../interfaces/IInletExitAdapter.sol";
import {ExitTypes} from "../libraries/ExitTypes.sol";

/// @notice Withdraws USDC from an Aave V3 pool by pulling the owner's aTokens with an EIP 2612 permit. Runs by delegatecall inside the executor. Adapter data is abi.encode(pool).
contract AaveV3ExitAdapter is IInletExitAdapter {
    using SafeERC20 for IERC20;

    error NoReserve();

    function redeem(
        address usdc,
        address owner,
        uint256 amount,
        uint64 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external returns (uint256 received) {
        address pool = abi.decode(data, (address));
        address aToken = IAaveV3Pool(pool).getReserveData(usdc).aTokenAddress;
        if (aToken == address(0)) revert NoReserve();

        _pull(aToken, owner, amount, deadline, signature);

        uint256 before = IERC20(usdc).balanceOf(address(this));
        IAaveV3Pool(pool).withdraw(usdc, type(uint256).max, address(this));
        received = IERC20(usdc).balanceOf(address(this)) - before;
    }

    function _pull(
        address aToken,
        address owner,
        uint256 amount,
        uint64 deadline,
        bytes calldata signature
    ) internal {
        (uint8 v, bytes32 r, bytes32 s) = ExitTypes.split(signature);
        IERC20Permit(aToken).permit(owner, address(this), amount, deadline, v, r, s);
        IERC20(aToken).safeTransferFrom(owner, address(this), amount);
    }
}
