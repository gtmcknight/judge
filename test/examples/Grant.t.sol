// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {MilestoneGrant} from "../../src/examples/Grant.sol";

contract MilestoneGrantTest is Test, JudgedTest {
    function test_eachMilestonePaysOnce() public {
        MilestoneGrant grant = new MilestoneGrant();
        vm.deal(address(grant), 3 ether);

        grant.claim{value: 0.002 ether}(0, "https://github.com/team/app/releases/tag/v1.0.0");
        grant.settle(answerYes());

        assertEq(grant.team().balance, 1 ether);
        vm.expectRevert("closed");
        grant.claim{value: 0.002 ether}(0, "https://github.com/team/app/releases/tag/v1.0.0");
    }
}
