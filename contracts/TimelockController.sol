// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin Contracts v5.x
import {
    TimelockController as OZTimelockController
} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * Timelock dédié à la DAO étudiante.
 * Déployer ce contrat AVANT StudentGovernor.
 */
contract StudentTimelockController is OZTimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    )
        OZTimelockController(
            minDelay,
            proposers,
            executors,
            admin
        )
    {}
}
