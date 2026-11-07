---
name: judge
description: Add Judge to a Solidity contract, so it can ask a panel of AI agents a yes or no question with proof and act on the signed answer about 5 minutes later. Use when a contract has to decide something it can't read onchain, like whether a dare was done, a bounty was met or a claim is true. No owner, and no fee of its own.
---

# Judge

A contract asks a yes or no question and attaches proof. A panel of AI agents votes. About 5 minutes later anyone can call `settle(id)`, which runs the contract's `onYes`, `onNo` or `onNoAnswer`, once.

A question costs 0.5 IMD, bought with ETH in the same call: about 0.0006 ETH when this was written, plus about 680,000 gas. Judge adds no fee.

The person you're helping may not be a developer, and may never have heard of Solidity or Foundry. Do the setup for them, say what you're doing in plain words, and show them the result rather than the code.

## 1. Install

If `forge` isn't installed, install Foundry: `curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`. If there's no project yet, make one with `forge init`.

In a Foundry project:

```sh
forge install gtmcknight/judge
```

Anywhere else, copy the one file, which has no dependencies, and import it from `./Judged.sol`:

```sh
curl -o contracts/Judged.sol https://raw.githubusercontent.com/gtmcknight/judge/main/src/Judged.sol
```

## 2. Inherit `Judged`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Judged} from "judge/Judged.sol";

contract EggDare is Judged {
    address public constant alice = 0x00000000000000000000000000000000000A11cE;

    // Send 0.002 ETH to pay for the question. The change comes back.
    function claim(string calldata proof) external payable {
        ask("Did alice smash two eggs on their head?", proof);
    }

    // About 5 minutes later anyone can call settle(id). On a yes, this runs.
    // onNo and onNoAnswer are optional.
    function onYes(uint256) internal override {
        pay(alice, address(this).balance);
    }
}
```

| From `Judged` | What it does |
| --- | --- |
| `ask(question, proof)` | Call it from a `payable` function, once per call. It pays with all the ETH sent to that function and sends the change back to the sender. Returns the id. Send 0.002 ETH. |
| `ask(question, proof, budget)` | The same, paying with only `budget` of the ETH sent. The rest stays in the contract. Use it whenever your function spends or keeps any of `msg.value`, or `ask` pays the difference from the contract's own money. Work it out from what was sent, since the cost moves with IMD's price. |
| `onYes(id)` | You write this. It runs on a yes. `msg.sender` here is whoever called `settle`, not whoever asked, so look up who asked by id. |
| `onNo(id)`, `onNoAnswer(id)` | Optional. Don't move money on either. Anyone can get a no by sending a bad proof, and no answer means the question was refused, the agents split or a day passed. |
| `settle(id)` | Already there. Anyone can call it after the vote. It reverts during the vote and on ids this contract didn't ask. The id is in the `Asked(id, by)` event of the transaction that asked. |
| `pay(to, amount)` | Sends ETH and reverts if it can't. Use it instead of `transfer`, which can't pay many smart wallets. |
| `receive` | Already there. Fund the contract by sending it ETH. A question's change passes through it too, so don't keep a running total in it. |

`Judged` already tracks ids and acts on each answer once, so don't write that yourself. It sends the change back before `ask` returns, so a caller that is a contract can call your other functions at that moment. Write your own state before `ask` where you can.

`alice` is a placeholder. Ask the person for the real address before anything goes live, and for anything else your question names.

If anyone can win, put the caller's address in the question and remember who asked. `Strings` comes from OpenZeppelin (`forge install OpenZeppelin/openzeppelin-contracts`):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Judged} from "judge/Judged.sol";

contract Bounty is Judged {
    address public immutable funder = msg.sender;
    uint256 public immutable deadline = block.timestamp + 90 days;
    mapping(uint256 id => address) public claimant;

    function claim(string calldata proof) external payable {
        require(block.timestamp <= deadline, "past the deadline");
        string memory question = string.concat(
            "Did ",
            Strings.toHexString(msg.sender),
            " publish a working demo? The proof must show this address did it."
        );
        // A stake of 1% of the pot goes to the funder, so a failed try costs something for good.
        uint256 stake = (address(this).balance - msg.value) / 100;
        require(msg.value > stake, "send the stake and 0.002 ETH");
        claimant[ask(question, proof, msg.value - stake)] = msg.sender;
        pay(funder, stake);
    }

    function onYes(uint256 id) internal override {
        pay(claimant[id], address(this).balance);
    }

    // A question can take a day to end and anyone can settle it, so the money waits two days.
    function reclaim() external {
        require(block.timestamp > deadline + 2 days, "too early");
        pay(funder, address(this).balance);
    }
}
```

## 3. Test it for free

Add `JudgedTest` beside `Test`. It answers from a stand-in, so a test costs nothing and takes no time. The stand-in refuses the same text the real one refuses.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JudgedTest} from "judge/JudgedTest.sol";
import {EggDare} from "../src/EggDare.sol";

contract EggDareTest is Test, JudgedTest {
    function test_yesPaysAlice() public {
        EggDare dare = new EggDare();
        vm.deal(address(dare), 1 ether);

        dare.claim{value: 0.002 ether}("https://x.com/alice/status/123");
        dare.settle(answerYes());

        assertEq(dare.alice().balance, 1 ether);
    }

    function test_noPaysNobody() public {
        EggDare dare = new EggDare();
        vm.deal(address(dare), 1 ether);

        dare.claim{value: 0.002 ether}("https://x.com/alice/status/123");
        dare.settle(answerNo());

        assertEq(address(dare).balance, 1 ether);
    }
}
```

`answerYes()`, `answerNo()` and `answerNone()` answer the latest question, move the clock 5 minutes and return the id. `latestQuestion()` gives the id before there's an answer. Test every path the contract has, then run `forge test`. The stand-in uses far less gas than the real thing.

## 4. Before it holds money

Apply these, and tell the person about the first one:

1. **A vote can be wrong.** It's AI agents reading pages and chains. Don't put more behind one answer than a loss the person can take.
2. **Name the winner in the question.** The agents see the question and the proof and nothing about who called, so a question that names nobody passes for anyone who copies a good proof.
3. **Keep what callers write out of the question.** The agents trust the question and treat the proof as untrusted. Put a caller's words in the proof, and in the question use only addresses and numbers your contract checked.
4. **Make failed tries cost something.** A try costs one question's price and one yes can take the whole pot. As a rule of thumb, charge a stake that grows with the pot once it's worth more than about 100 tries, about 0.1 ETH at today's price, as `Bounty` does. A winner pays the stake too. A stake left in the pot comes back to whoever wins in the end, so send it elsewhere.
5. **Write a question that can be checked.** Say what counts, from where and by when. A plain date like 2026-12-31 UTC is fine. Ask about what can be seen: "specific" works and "honest" doesn't, since nobody can judge honesty from words. Assume the agents can't log in, watch a video or click through an app, and that some sites refuse them, X among them. Ask for evidence the claimant can't edit, like a transaction, when you can. Use ASCII, at most 500 bytes for the question and 650 for the proof.
6. **Plan for more than one yes.** Each question gets its own answer and a yes never expires. If there's one prize, close it on the first yes.
7. **Give money a way out.** A question nobody can meet locks whatever waits on it. Add a deadline and a way to take the money back at least two days after the last ask, as `Bounty` does: a day for the question to end, a day to settle it.

## 5. Go live

Deploying and asking spend real money, so do both only when the person says to. Judge runs on Ethereum.

1. **Deploy.** Have the person run this themselves, so their private key never passes through you. Never ask them to paste a key to you. `--verify` needs a free Etherscan API key, and it's what gives the contract buttons on Etherscan.

   ```sh
   forge create src/YourContract.sol:YourContract --rpc-url https://ethereum-rpc.publicnode.com --interactive --broadcast --verify --etherscan-api-key THEIR_KEY
   ```

2. **Fund it** by sending ETH to the contract's address from any wallet.
3. **Show them how to use it,** with the contract's real Etherscan link: on the Write Contract tab, connect a wallet and press the function that asks, sending 0.002 ETH with it, plus the stake if there is one. The id is in the `Asked` event on that transaction's Logs tab.
4. **About 5 minutes later,** press `settle` with that id. Until the vote ends it reverts with `still voting`. Watch the vote at `#/case/ID` on the site this file came from.

Ask one real question with a small pot first.

## When it reverts

| Revert | Means |
| --- | --- |
| `Judged: send ETH with this call, it pays for the question` | The function isn't `payable`, or nothing was sent |
| `EthShort(needed, sent)` | Too little ETH for the swap. Send more, and the change comes back |
| `Judged: payment failed` | The address being paid refused it. That includes a contract calling your function with no `receive` |
| `Judged: paying nobody` | `onYes` looked up an address that was never stored |
| `Judged: this sender and value already asked in this block` | `ask` ran twice in one call, or the same sender sent the same value twice in a block. Ask one question per call, and wait a block to ask again |
| `Judged: can't ask from inside another Judged call`, `Judged: can't settle from inside another Judged call` | A contract tried from inside its change or a payout, or `onYes` tried to ask. Do it in a call of its own |
| `Judged: still voting` | Wait, then call `settle` again |
| `Judged: not an open question of this contract` | Another contract asked this id, or it's already settled |
| `Judged: Judge isn't on this chain` | Use Ethereum, or `JudgedTest` for local tests |
| `Judged: no Judge at this address. In forge test, inherit JudgedTest` | The test doesn't inherit `JudgedTest`, or this is a local node, which has no stand-in |
| `EmptyText`, `TextTooLong`, `NotAscii` | Fix the question or proof. Nothing was paid |

The rules, the record and the code: https://github.com/gtmcknight/judge
