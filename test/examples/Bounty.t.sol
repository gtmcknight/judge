// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {IssueBounty} from "../../src/examples/Bounty.sol";

contract IssueBountyTest is Test, JudgedTest {
    function test_yesPaysWhoeverClaimed() public {
        IssueBounty bounty = new IssueBounty();
        vm.deal(address(bounty), 1 ether);
        address dev = address(0xA11cE);
        vm.deal(dev, 0.002 ether);

        vm.prank(dev);
        bounty.claim{value: 0.002 ether}("https://github.com/me/repo/pull/34");
        bounty.settle(answerYes());

        assertEq(address(bounty).balance, 0);
        assertGt(dev.balance, 1 ether);
    }
}
