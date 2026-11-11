// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "../Judged.sol";

contract GtaMarket is Judged {
    uint256 public constant closes = 1798761599; // Dec 31, 2026, the last second
    uint256 public constant lastYes = 1799366399; // Jan 7, 2027: a yes must be asked by then

    mapping(address => uint256) public yesBets;
    mapping(address => uint256) public noBets;
    uint256 public yesTotal;
    uint256 public noTotal;
    bool public yesWon;
    bool public noPaying;

    function betYes() external payable {
        require(block.timestamp <= closes, "betting is closed");
        yesBets[msg.sender] += msg.value;
        yesTotal += msg.value;
    }

    function betNo() external payable {
        require(block.timestamp <= closes, "betting is closed");
        noBets[msg.sender] += msg.value;
        noTotal += msg.value;
    }

    // Once it's out, anyone asks with a link to the news. Send 0.002 ETH. The change comes back.
    function resolve(string calldata proof) external payable {
        require(block.timestamp <= lastYes, "too late");
        ask("Was GTA 6 released on or before Dec 31, 2026?", proof);
    }

    // A no never decides it: anyone can get one with a bad link. The no side wins by time.
    function onYes(uint256) internal override {
        if (!noPaying) yesWon = true;
    }

    // Winners split the whole pot by what they bet. If nobody took the winning side, everyone gets their bet back.
    function collect() external {
        if (!yesWon) {
            require(block.timestamp > lastYes + 2 days, "not over yet");
            noPaying = true;
        }
        uint256 pot = yesTotal + noTotal;
        uint256 side = yesWon ? yesTotal : noTotal;
        uint256 bet = yesWon ? yesBets[msg.sender] : noBets[msg.sender];
        if (side == 0) bet = yesBets[msg.sender] + noBets[msg.sender];
        yesBets[msg.sender] = 0;
        noBets[msg.sender] = 0;
        pay(msg.sender, side == 0 ? bet : (bet * pot) / side);
    }
}
