// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {InletReceiver} from "../src/InletReceiver.sol";

/// @notice Registers an adapter that is already deployed under NAME on RECEIVER.
contract RegisterAdapter is Script {
    function run() external {
        string memory name = vm.envString("NAME");
        InletReceiver receiver = InletReceiver(vm.envAddress("RECEIVER"));
        address adapter = vm.envAddress("ADAPTER");
        bytes32 id = keccak256(bytes(string.concat(name, ":v1")));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        receiver.setAdapter(id, adapter);
        vm.stopBroadcast();

        console.log(name, adapter);
    }
}
