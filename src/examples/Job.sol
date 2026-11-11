// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "../Judged.sol";

contract ArticleJob is Judged {
    address public constant alice = 0x00000000000000000000000000000000000A11cE;
    address public immutable funder = msg.sender;
    uint256 public immutable deadline = block.timestamp + 30 days;

    // Send 0.002 ETH with a link to the article. The change comes back.
    function claim(string calldata proof) external payable {
        require(block.timestamp <= deadline, "past the deadline");
        ask("Is alice's article published on mysite.com? The proof is a link to it.", proof);
    }

    function onYes(uint256) internal override {
        pay(alice, address(this).balance);
    }

    function reclaim() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(funder, address(this).balance);
    }
}
