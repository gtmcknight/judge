// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Judged} from "../Judged.sol";

contract IssueBounty is Judged {
    address public immutable funder = msg.sender;
    uint256 public immutable deadline = block.timestamp + 90 days;
    mapping(uint256 id => address) public claimant;

    // Send 0.002 ETH with a link to your merged pull request. Its description must name your address.
    function claim(string calldata proof) external payable {
        require(block.timestamp <= deadline, "past the deadline");
        string memory question = string.concat(
            "Did ",
            Strings.toHexString(msg.sender),
            " get a pull request that fixes issue 12 merged into github.com/me/repo? The pull request must name this address."
        );
        claimant[ask(question, proof)] = msg.sender;
    }

    function onYes(uint256 id) internal override {
        pay(claimant[id], address(this).balance);
    }

    // A question can take a day to end and anyone can settle it, so the money waits two days.
    function reclaim() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(funder, address(this).balance);
    }
}
