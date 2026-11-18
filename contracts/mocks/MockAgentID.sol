// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice TEST-ONLY stand-in for the Agent ID ERC-721 contract.
/// Implements just the balanceOf surface AgentCheckIn reads, with a
/// permissionless mint so tests can create holders and non-holders.
/// Never deploy this to a real network.
contract MockAgentID {
    mapping(address => uint256) private _balances;

    function mint(address to) external {
        _balances[to] += 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }
}
