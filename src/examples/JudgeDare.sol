// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {JudgeEthDoor} from "../JudgeEthDoor.sol";
import {IJudge} from "../interfaces/IJudge.sol";

/// @title A dare: a pot for whoever proves they did it
/// @notice The worked example for `Judge`. The pot stays here and moves only on a `Yes` to a case this
/// contract asked. A claimant pays for the panel in ETH and stakes 1% of the pot, and what that did not
/// cost comes back. The stake stays in the pot, so a winner gets theirs back and every failed try makes
/// the next one dearer and the prize larger. The rule names the claimant, so a proof copied from someone
/// else fails it. The creator takes back whatever is left two days after the deadline: a day for the
/// last case to answer, a day for its winner to collect.
contract JudgeDare {
    error DareOver();
    error StakeShort(uint256 stake, uint256 sent);
    error NotAWinner();
    error TooEarly();
    error NotTheDoor();
    error PaymentFailed();

    JudgeEthDoor public immutable door;
    IJudge public immutable judge;
    address public immutable creator;
    uint256 public immutable deadline;
    string public rule;
    mapping(uint256 id => address claimant) public claimantOf;

    constructor(JudgeEthDoor door_, string memory rule_, uint256 deadline_) payable {
        door = door_;
        judge = door_.judge();
        creator = msg.sender;
        deadline = deadline_;
        rule = rule_;
    }

    function claim(string calldata proof) external payable returns (uint256 id) {
        uint256 pot = address(this).balance - msg.value;
        if (pot == 0 || block.timestamp >= deadline) revert DareOver();
        uint256 stake = pot / 100;
        if (msg.value <= stake) revert StakeShort(stake, msg.value);
        string memory named = string.concat(rule, " The claimant is ", Strings.toHexString(msg.sender), ": the proof must show this address did it.");
        id = door.ask{value: msg.value - stake}(named, proof);
        claimantOf[id] = msg.sender;
        _pay(msg.sender, address(this).balance - pot - stake);
    }

    function collect(uint256 id) external {
        address claimant = claimantOf[id];
        if (claimant == address(0) || judge.verdict(id) != IJudge.Verdict.Yes) revert NotAWinner();
        delete claimantOf[id];
        _pay(claimant, address(this).balance);
    }

    function reclaim() external {
        if (block.timestamp < deadline + 2 days) revert TooEarly();
        _pay(creator, address(this).balance);
    }

    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PaymentFailed();
    }

    /// @dev Only the door's refund: a pot topped up later would be a prize for a `Yes` nobody collected.
    receive() external payable {
        if (msg.sender != address(door)) revert NotTheDoor();
    }
}
