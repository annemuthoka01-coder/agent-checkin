// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC-721 interface — only what AgentCheckIn needs.
/// @dev Agent ID is a non-transferable ERC-721 (SPACE ID Agent ID on BSC).
interface IERC721Minimal {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentCheckIn
/// @notice A daily check-in board gated by Binance Agent ID ownership.
///
/// Agent ID is the access-control layer of this product: only an address
/// that holds an Agent ID (balanceOf > 0 on the Agent ID contract) can
/// check in. Each holder can check in once per UTC day, building a
/// consecutive-day streak.
///
/// Design constraints (deliberate):
/// - No funds ever move: there are no payable functions, no transfers,
///   no approvals, and nothing to withdraw.
/// - No owner and no admin powers: nobody can alter another user's data.
/// - No identity lookup: the contract never resolves names to wallets;
///   it only checks the caller's own Agent ID balance.
contract AgentCheckIn {
    /// @notice The Agent ID contract this board is gated by (BSC mainnet
    /// Agent ID: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f).
    address public immutable agentIdContract;

    struct Stats {
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 totalCheckIns;
        uint256 lastCheckInDay; // UTC day number (block.timestamp / 86400)
        bool counted; // already included in the unique checkers count
    }

    mapping(address => Stats) private _stats;
    uint256 private _uniqueCheckers;

    event CheckedIn(
        address indexed user,
        uint256 day,
        uint256 currentStreak,
        uint256 totalCheckIns
    );

    constructor(address agentIdContract_) {
        require(agentIdContract_ != address(0), "AgentCheckIn: zero address");
        agentIdContract = agentIdContract_;
    }

    /// @notice Check in for today (UTC). One check-in per day per address.
    /// Requires the caller to hold an Agent ID.
    function checkIn() external {
        require(
            IERC721Minimal(agentIdContract).balanceOf(msg.sender) > 0,
            "AgentCheckIn: no Agent ID"
        );

        uint256 today = block.timestamp / 86400;
        Stats storage s = _stats[msg.sender];

        require(
            !(s.totalCheckIns > 0 && s.lastCheckInDay == today),
            "AgentCheckIn: already checked in today"
        );

        // Consecutive day -> extend the streak; any gap -> restart at 1.
        if (s.totalCheckIns > 0 && today > 0 && s.lastCheckInDay == today - 1) {
            s.currentStreak += 1;
        } else {
            s.currentStreak = 1;
        }
        if (s.currentStreak > s.bestStreak) {
            s.bestStreak = s.currentStreak;
        }
        s.totalCheckIns += 1;
        s.lastCheckInDay = today;

        if (!s.counted) {
            s.counted = true;
            _uniqueCheckers += 1;
        }

        emit CheckedIn(msg.sender, today, s.currentStreak, s.totalCheckIns);
    }

    /// @notice Current consecutive-day streak (as of the last check-in).
    function streakOf(address user) external view returns (uint256) {
        return _stats[user].currentStreak;
    }

    /// @notice Longest streak the address has ever reached.
    function bestStreakOf(address user) external view returns (uint256) {
        return _stats[user].bestStreak;
    }

    /// @notice Lifetime number of check-ins by the address.
    function totalCheckInsOf(address user) external view returns (uint256) {
        return _stats[user].totalCheckIns;
    }

    /// @notice UTC day number of the address's most recent check-in (0 if never).
    function lastCheckInDayOf(address user) external view returns (uint256) {
        return _stats[user].lastCheckInDay;
    }

    /// @notice How many distinct addresses have ever checked in.
    function uniqueCheckers() external view returns (uint256) {
        return _uniqueCheckers;
    }

    /// @notice Whether the address has already checked in today (UTC).
    function hasCheckedInToday(address user) external view returns (bool) {
        Stats storage s = _stats[user];
        return s.totalCheckIns > 0 && s.lastCheckInDay == block.timestamp / 86400;
    }
}
