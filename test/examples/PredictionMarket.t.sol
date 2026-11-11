// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "../../src/JudgedTest.sol";
import {GtaMarket} from "../../src/examples/PredictionMarket.sol";

contract GtaMarketTest is Test, JudgedTest {
    GtaMarket market = new GtaMarket();
    address yes = address(0xA11cE);
    address no = address(0xB0B);

    function setUp() public {
        vm.deal(yes, 1 ether);
        vm.deal(no, 1 ether);
        vm.prank(yes);
        market.betYes{value: 1 ether}();
        vm.prank(no);
        market.betNo{value: 1 ether}();
    }

    function test_yesTakesThePot() public {
        market.resolve{value: 0.002 ether}("https://www.rockstargames.com/newswire");
        market.settle(answerYes());

        vm.prank(yes);
        market.collect();
        assertEq(yes.balance, 2 ether);
    }

    function test_noWinsWhenNoYesLands() public {
        vm.warp(market.lastYes() + 2 days + 1);

        vm.prank(no);
        market.collect();
        assertEq(no.balance, 2 ether);
    }
}
