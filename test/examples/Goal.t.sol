// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {MarathonGoal} from "../../src/examples/Goal.sol";

contract MarathonGoalTest is Test, JudgedTest {
    address runner = address(0xA11cE);
    MarathonGoal goal;

    function setUp() public {
        vm.prank(runner);
        goal = new MarathonGoal();
        vm.deal(address(goal), 0.5 ether);
    }

    function test_yesGivesItBack() public {
        goal.claim{value: 0.002 ether}("https://results.marathon.org/alice");
        goal.settle(answerYes());

        assertEq(runner.balance, 0.5 ether);
    }

    function test_missedItGoesToCharity() public {
        vm.warp(goal.deadline() + 2 days + 1);
        goal.giveUp();

        assertEq(goal.charity().balance, 0.5 ether);
    }
}
