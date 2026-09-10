// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {InletExit} from "../src/InletExit.sol";
import {AaveV3ExitAdapter} from "../src/adapters/AaveV3ExitAdapter.sol";
import {CompoundV3ExitAdapter} from "../src/adapters/CompoundV3ExitAdapter.sol";
import {ERC4626ExitAdapter} from "../src/adapters/ERC4626ExitAdapter.sol";

/// @notice Deploys the exit rail and its three adapters on an EVM destination and registers them.
contract DeployExit is Script {
    function run() external {
        address usdc = vm.envAddress("USDC");
        address tokenMessenger = vm.envAddress("TOKEN_MESSENGER");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER", vm.addr(key));

        vm.startBroadcast(key);
        InletExit exit = new InletExit(usdc, tokenMessenger, owner);
        ERC4626ExitAdapter erc4626 = new ERC4626ExitAdapter();
        AaveV3ExitAdapter aave = new AaveV3ExitAdapter();
        CompoundV3ExitAdapter compound = new CompoundV3ExitAdapter();
        exit.setAdapter(keccak256("erc4626-exit:v1"), address(erc4626));
        exit.setAdapter(keccak256("aave-v3-exit:v1"), address(aave));
        exit.setAdapter(keccak256("compound-v3-exit:v1"), address(compound));
        vm.stopBroadcast();

        console.log("InletExit", address(exit));
        console.log("ERC4626ExitAdapter", address(erc4626));
        console.log("AaveV3ExitAdapter", address(aave));
        console.log("CompoundV3ExitAdapter", address(compound));
    }
}
