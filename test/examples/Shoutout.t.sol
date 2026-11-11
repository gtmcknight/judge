// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {Shoutout} from "../../src/examples/Shoutout.sol";

contract ShoutoutTest is Test, JudgedTest {
    function test_yesPaysAlice() public {
        Shoutout deal = new Shoutout();
        vm.deal(address(deal), 0.5 ether);

        deal.claim{value: 0.002 ether}("https://x.com/alice/status/123");
        deal.settle(answerYes());

        assertEq(deal.alice().balance, 0.5 ether);
    }
}
