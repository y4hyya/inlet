// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAaveV3Pool} from "../../src/interfaces/IAaveV3.sol";

contract MockAToken is ERC20, ERC20Permit {
    address public immutable pool;
    address public immutable underlying;

    constructor(address pool_, address underlying_)
        ERC20("Aave USDC", "aUSDC")
        ERC20Permit("Aave USDC")
    {
        pool = pool_;
        underlying = underlying_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == pool, "only pool");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == pool, "only pool");
        _burn(from, amount);
    }
}

contract MockAavePool is IAaveV3Pool {
    mapping(address asset => MockAToken) public aTokens;
    bool public paused;

    function listReserve(address asset) external returns (MockAToken aToken) {
        aToken = new MockAToken(address(this), asset);
        aTokens[asset] = aToken;
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        require(!paused, "RESERVE_PAUSED");
        MockAToken aToken = aTokens[asset];
        require(address(aToken) != address(0), "RESERVE_INACTIVE");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        MockAToken aToken = aTokens[asset];
        require(address(aToken) != address(0), "RESERVE_INACTIVE");
        uint256 balance = aToken.balanceOf(msg.sender);
        if (amount == type(uint256).max) amount = balance;
        require(amount <= balance, "NOT_ENOUGH_AVAILABLE_USER_BALANCE");
        aToken.burn(msg.sender, amount);
        IERC20(asset).transfer(to, amount);
        return amount;
    }

    function getReserveData(address asset) external view returns (ReserveData memory data) {
        data.aTokenAddress = address(aTokens[asset]);
    }
}
