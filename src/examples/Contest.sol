// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Judged} from "../Judged.sol";

contract ThreadContest is Judged {
    address public immutable funder = msg.sender;
    uint256 public immutable deadline = block.timestamp + 14 days;
    uint256 public winners;
    mapping(address => bool) public won;
    mapping(uint256 id => address) public entrant;

    // Send 0.002 ETH with a link to your thread. It must name your address.
    function enter(string calldata proof) external payable {
        require(block.timestamp <= deadline && winners < 10 && !won[msg.sender], "closed");
        string memory question = string.concat(
            "Did ",
            Strings.toHexString(msg.sender),
            " post a thread on X explaining myapp.xyz? The thread must name this address."
        );
        entrant[ask(question, proof)] = msg.sender;
    }

    // The first ten yes answers win 0.1 ETH each.
    function onYes(uint256 id) internal override {
        address who = entrant[id];
        if (winners == 10 || won[who]) return;
        won[who] = true;
        winners++;
        pay(who, 0.1 ether);
    }

    function reclaim() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(funder, address(this).balance);
    }
}
