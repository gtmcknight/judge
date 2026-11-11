// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {EggDare} from "../../src/examples/EggDare.sol";

contract EggDareTest is Test, JudgedTest {
    function test_yesPaysAlice() public {
        EggDare dare = new EggDare();
        vm.deal(address(dare), 1 ether);

        dare.claim{value: 0.002 ether}("https://x.com/alice/status/123");
        dare.settle(answerYes());

        assertEq(dare.alice().balance, 1 ether);
    }
}
