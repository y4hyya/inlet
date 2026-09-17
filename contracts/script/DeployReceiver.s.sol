// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InletReceiver} from "../src/InletReceiver.sol";
import {ERC4626Adapter} from "../src/adapters/ERC4626Adapter.sol";
import {DemoVault} from "../src/demo/DemoVault.sol";

/// @notice Deploys the receiver on an EVM destination with the ERC 4626 adapter, reusing one when ERC4626_ADAPTER is set, and the demo vault.
contract DeployReceiver is Script {
    function run() external {
        address usdc = vm.envAddress("USDC");
        address messageTransmitter = vm.envAddress("MESSAGE_TRANSMITTER");
        address hub = vm.envAddress("HUB");
        uint32 hubDomain = uint32(vm.envOr("HUB_DOMAIN", uint256(26)));
        uint256 key = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER", vm.addr(key));

        vm.startBroadcast(key);
        InletReceiver receiver = new InletReceiver(usdc, messageTransmitter, hubDomain, hub, owner);
        address adapter = vm.envOr("ERC4626_ADAPTER", address(0));
        if (adapter == address(0)) adapter = address(new ERC4626Adapter());
        receiver.setAdapter(keccak256("erc4626:v1"), adapter);
        if (vm.envOr("DEPLOY_DEMO_VAULT", true)) {
            DemoVault vault = new DemoVault(IERC20(usdc));
            console.log("DemoVault", address(vault));
        }
        vm.stopBroadcast();

        console.log("InletReceiver", address(receiver));
        console.log("ERC4626Adapter", adapter);
    }
}
