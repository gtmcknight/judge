// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "../Judged.sol";

contract MilestoneGrant is Judged {
    address public constant team = 0x00000000000000000000000000000000000A11cE;
    address public immutable funder = msg.sender;
    uint256 public immutable deadline = block.timestamp + 180 days;

    string[3] public milestones = [
        "Is a v1 release of github.com/team/app published on GitHub?",
        "Is the docs site for github.com/team/app live?",
        "Is github.com/team/app deployed on Ethereum mainnet?"
    ];
    bool[3] public paid;
    mapping(uint256 id => uint256) public milestoneOf;

    // Send 0.002 ETH with a link that shows the milestone. Each one pays 1 ETH, once.
    function claim(uint256 milestone, string calldata proof) external payable {
        require(block.timestamp <= deadline && !paid[milestone], "closed");
        milestoneOf[ask(milestones[milestone], proof)] = milestone;
    }

    function onYes(uint256 id) internal override {
        uint256 milestone = milestoneOf[id];
        if (paid[milestone]) return;
        paid[milestone] = true;
        pay(team, 1 ether);
    }

    function reclaim() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(funder, address(this).balance);
    }
}
