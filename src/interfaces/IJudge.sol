// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Say what has to be true, show it, and a panel of AI agents answers yes or no
/// @notice All a contract needs in order to use `Judge`: ask, then read the verdict a few minutes
/// later. It keeps its own money and acts on the verdict itself.
interface IJudge {
    /// @dev `Yes` and `No` are signed by the oracle and final. `NoAnswer` is final too and is not a
    /// ruling: the ask was refused, the panel split or nothing came within a day, and none of that
    /// is signed, so never pay anyone on it. An id nobody asked reads `Pending`, never `Yes`.
    enum Verdict {
        Pending,
        Yes,
        No,
        NoAnswer
    }

    /// @notice Opens a case and pulls `price()` from the caller, who has approved this contract.
    /// @param rule What has to be true, in ASCII, at most 500 bytes. Name whoever stands to win in it:
    /// the panel sees the rule and the proof and nothing about who called, so a rule that names nobody
    /// passes for anyone who copies a good proof.
    /// @param proof What shows it, in ASCII, at most 650 bytes. Treated as untrusted.
    /// @return id The case's number, counting from 1. Keep it, and act only on ids your own contract
    /// asked: anyone can open a case, so a verdict on an id a stranger hands you is a verdict on a
    /// question they chose.
    function ask(string calldata rule, string calldata proof) external returns (uint256 id);

    function verdict(uint256 id) external view returns (Verdict);

    /// @notice What a case costs right now, in the token this contract was deployed with.
    function price() external view returns (uint256);
}
