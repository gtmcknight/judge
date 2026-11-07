/** What a dev pastes, as the page shows it. The contract is `src/examples/EggDare.sol` with the installed import. */

export const INSTALL = "forge install gtmcknight/judge";

/** What someone might ask their AI for, in plain words. Money moves only on a yes in all of them. */
export const IDEAS = [
  ["a job", "Build me a contract that holds 1 ETH and pays alice when their article is published on my site."],
  ["a bounty", "Build me a contract that holds 1 ETH and pays alice when their pull request is merged into my repo."],
  ["a dare", "Build me a contract that holds 1 ETH and pays alice if they post proof they smashed two eggs on their head."],
] as const;

const FILE_TOP = ["// SPDX-License-Identifier: MIT", "pragma solidity ^0.8.20;", ""];

export const CONTRACT = [
  'import {Judged} from "judge/Judged.sol";',
  "",
  "contract EggDare is Judged {",
  "    address public constant alice = 0x00000000000000000000000000000000000A11cE;",
  "",
  "    // Send 0.002 ETH to pay for the question. The change comes back.",
  "    function claim(string calldata proof) external payable {",
  '        ask("Did alice smash two eggs on their head?", proof);',
  "    }",
  "",
  "    // About 5 minutes later anyone can call settle(id). On a yes, this runs.",
  "    // onNo and onNoAnswer are optional.",
  "    function onYes(uint256) internal override {",
  "        pay(alice, address(this).balance);",
  "    }",
  "}",
];

export const TEST = [
  'import {Test} from "forge-std/Test.sol";',
  'import {JudgedTest} from "judge/JudgedTest.sol";',
  'import {EggDare} from "../src/EggDare.sol";',
  "",
  "contract EggDareTest is Test, JudgedTest {",
  "    function test_yesPaysAlice() public {",
  "        EggDare dare = new EggDare();",
  "        vm.deal(address(dare), 1 ether);",
  "",
  '        dare.claim{value: 0.002 ether}("https://x.com/alice/status/123");',
  "        dare.settle(answerYes());",
  "",
  "        assertEq(dare.alice().balance, 1 ether);",
  "    }",
  "}",
];

/** The whole file, which compiles as it lands. */
export const asFile = (lines: string[]) => [...FILE_TOP, ...lines, ""].join("\n");
