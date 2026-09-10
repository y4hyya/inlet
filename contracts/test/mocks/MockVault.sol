// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockVault is ERC4626, ERC20Permit {
    constructor(IERC20 asset_)
        ERC20("Mock Vault", "mVLT")
        ERC20Permit("Mock Vault")
        ERC4626(asset_)
    {}

    function decimals() public view override(ERC4626, ERC20) returns (uint8) {
        return ERC4626.decimals();
    }
}
