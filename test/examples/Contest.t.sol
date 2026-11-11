// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {ThreadContest} from "../../src/examples/Contest.sol";

contract ThreadContestTest is Test, JudgedTest {
    function test_aYesWinsOnce() public {
        ThreadContest contest = new ThreadContest();
        vm.deal(address(contest), 1 ether);
        address fan = address(0xA11cE);
        vm.deal(fan, 0.004 ether);

        vm.prank(fan);
        contest.enter{value: 0.002 ether}("https://x.com/fan/status/456");
        contest.settle(answerYes());

        assertEq(contest.winners(), 1);
        vm.prank(fan);
        vm.expectRevert("closed");
        contest.enter{value: 0.002 ether}("https://x.com/fan/status/789");
    }
}
