// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITokenMessengerV2} from "./ICctp.sol";

/// @notice What an executor reads from the InletExit that is creating it.
interface IInletExit {
    function usdc() external view returns (address);

    function tokenMessenger() external view returns (ITokenMessengerV2);

    function adapters(bytes32 adapterId) external view returns (address);

    function pending() external view returns (bytes memory intent, bytes memory signature);
}
