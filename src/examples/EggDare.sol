// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "../Judged.sol";

contract EggDare is Judged {
    address public constant alice = 0x00000000000000000000000000000000000A11cE;

    // Send 0.002 ETH to pay for the question. The change comes back.
    function claim(string calldata proof) external payable {
        ask("Did alice smash two eggs on their head?", proof);
    }

    // About 5 minutes later anyone can call settle(id). On a yes, this runs.
    // onNo and onNoAnswer are optional.
    function onYes(uint256) internal override {
        pay(alice, address(this).balance);
    }
}
