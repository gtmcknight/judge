// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {ArticleJob} from "../../src/examples/Job.sol";

contract ArticleJobTest is Test, JudgedTest {
    function test_yesPaysAlice() public {
        ArticleJob job = new ArticleJob();
        vm.deal(address(job), 1 ether);

        job.claim{value: 0.002 ether}("https://mysite.com/alices-article");
        job.settle(answerYes());

        assertEq(job.alice().balance, 1 ether);
    }
}
