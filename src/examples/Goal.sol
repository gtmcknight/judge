// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "../Judged.sol";

contract MarathonGoal is Judged {
    address public immutable alice = msg.sender; // you, who locks the ETH
    address public constant charity = 0x0000000000000000000000000000000000c4A21e;
    uint256 public constant deadline = 1811808000; // June 1, 2027

    // Lock the ETH by sending it here. Then send 0.002 ETH with a link to your race results.
    function claim(string calldata proof) external payable {
        require(block.timestamp < deadline, "too late");
        ask("Did alice finish a marathon before June 1, 2027? The proof is the race results.", proof);
    }

    function onYes(uint256) internal override {
        pay(alice, address(this).balance);
    }

    // Missed it: two days after the deadline, anyone can send the ETH to the charity.
    function giveUp() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(charity, address(this).balance);
    }
}
