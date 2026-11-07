// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {Judge} from "../src/Judge.sol";
import {JudgeEthDoor} from "../src/JudgeEthDoor.sol";
import {JUDGE_STAND_IN, Judged} from "../src/Judged.sol";
import {JudgeStandIn, JudgedTest} from "../src/JudgedTest.sol";
import {EggDare} from "../src/examples/EggDare.sol";
import {JudgePoolBase} from "./Judge.t.sol";

/// @dev Records which answer ran, and asks wherever a test points it.
contract JudgedProbe is Judged {
    address private immutable judgeAt;
    address private immutable doorAt;
    uint256[] public ran;
    uint256 public yesCount;
    uint256 public noCount;
    uint256 public noneCount;

    constructor(address judge_, address door_) payable {
        judgeAt = judge_;
        doorAt = door_;
    }

    function claim(string calldata proof) external payable returns (uint256) {
        return ask("Did this happen?", proof);
    }

    function onYes(uint256 id) internal override {
        ++yesCount;
        ran.push(id);
    }

    function onNo(uint256 id) internal override {
        ++noCount;
        ran.push(id);
    }

    function onNoAnswer(uint256 id) internal override {
        ++noneCount;
        ran.push(id);
    }

    function _judge() internal view override returns (address, address) {
        return (judgeAt, doorAt);
    }
}

/// @dev What a dev writes who forgets the word payable.
contract JudgedNotPayable is Judged {
    function claim(string calldata proof) external {
        ask("Did this happen?", proof);
    }

    function onYes(uint256) internal override {}
}

/// @dev What a dev writes who asks in a loop: the second ask would spend the pot.
contract JudgedAsksTwice is Judged {
    function claim(string calldata proof) external payable {
        ask("Did this happen?", proof);
        ask("Did that happen?", proof);
    }

    function onYes(uint256) internal override {}
}

/// @dev A payable multicall, the common kind: `msg.value` repeats in every call it makes.
contract JudgedMulticall is EggDare {
    function multicall(bytes[] calldata calls) external payable {
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory data) = address(this).delegatecall(calls[i]);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(data, 0x20), mload(data))
                }
            }
        }
    }
}

/// @dev The same on any door a test names.
contract JudgedMulticallProbe is JudgedProbe {
    constructor(address judge_, address door_) payable JudgedProbe(judge_, door_) {}

    function multicall(bytes[] calldata calls) external payable {
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory data) = address(this).delegatecall(calls[i]);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(data, 0x20), mload(data))
                }
            }
        }
    }
}

/// @dev Keeps a stake of 1% of the pot.
contract JudgedStakes is Judged {
    function claim(string calldata proof) external payable {
        uint256 stake = (address(this).balance - msg.value) / 100;
        require(msg.value > stake, "send the stake too");
        ask("Did this happen?", proof, msg.value - stake);
    }

    function claimWithBudget(string calldata proof, uint256 budget) external payable {
        ask("Did this happen?", proof, budget);
    }

    function onYes(uint256) internal override {}
}

/// @dev Spends part of what was sent, and passes the rest as the budget, as the docs say to.
contract JudgedReferral is Judged {
    function claim(string calldata proof, address referrer) external payable {
        uint256 cut = msg.value / 10;
        pay(referrer, cut);
        ask("Did this happen?", proof, msg.value - cut);
    }

    function onYes(uint256) internal override {}
}

/// @dev Says where `Judged` looks, chain by chain.
contract JudgedWhere is EggDare {
    function where() external view returns (address judge, address door) {
        return _judge();
    }
}

/// @dev A dev's own `receive` that refuses money, the door's change included.
contract JudgedRefusesChange is Judged {
    function claim(string calldata proof) external payable {
        ask("Did this happen?", proof);
    }

    function onYes(uint256) internal override {}

    receive() external payable override {
        revert("no ETH here");
    }
}

/// @dev Pays whoever the test says on a yes.
contract JudgedPays is Judged {
    address private immutable to;

    constructor(address to_) payable {
        to = to_;
    }

    function claim(string calldata proof) external payable {
        ask("Did this happen?", proof);
    }

    function onYes(uint256) internal override {
        pay(to, address(this).balance);
    }
}

/// @dev A dev's mistake: the prize is marked paid only after it's paid.
contract JudgedFlagAfterPay is Judged {
    address private immutable to;
    bool public paid;

    constructor(address to_) payable {
        to = to_;
    }

    function claim(string calldata proof) external payable {
        ask("Did this happen?", proof);
    }

    function onYes(uint256) internal override {
        if (paid) return;
        pay(to, 1 ether);
        paid = true;
    }
}

/// @dev Points `Judged` somewhere new after asking.
contract JudgedMoves is Judged {
    address public judgeAt;
    address public doorAt;

    constructor(address judge_, address door_) payable {
        judgeAt = judge_;
        doorAt = door_;
    }

    function move(address judge_, address door_) external {
        judgeAt = judge_;
        doorAt = door_;
    }

    function claim(string calldata proof) external payable returns (uint256) {
        return ask("Did this happen?", proof);
    }

    uint256 public yesCount;

    function onYes(uint256) internal override {
        ++yesCount;
    }

    function _judge() internal view override returns (address, address) {
        return (judgeAt, doorAt);
    }
}

/// @dev Asks again from inside its change.
contract JudgedBouncer {
    bool private again = true;

    function go(EggDare dare) external payable {
        dare.claim{value: msg.value}("first");
    }

    receive() external payable {
        if (!again) return;
        again = false;
        EggDare(payable(msg.sender)).claim{value: msg.value}("second");
    }
}

/// @dev Tries to get a second ask through one call by asking from inside the change, and swallowing what happens.
contract JudgedSneak {
    JudgedAsksTwice private immutable target;
    bool private entered;

    constructor(JudgedAsksTwice target_) {
        target = target_;
    }

    function go() external payable {
        target.claim{value: msg.value}("first");
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        try target.claim{value: msg.value}("second") {} catch {}
    }
}

/// @dev Settles an older question from inside its change, before the asking function has finished.
contract JudgedSettlesFromChange {
    JudgedProbe private immutable target;
    uint256 public older;
    bool public got;

    constructor(JudgedProbe target_) {
        target = target_;
    }

    function ask() external payable returns (uint256) {
        return target.claim{value: msg.value}("first");
    }

    function setOlder(uint256 id) external {
        older = id;
    }

    receive() external payable {
        if (older == 0) return;
        try target.settle(older) {
            got = true;
        } catch {}
    }
}

/// @dev Calls settle again from inside the money it was paid, and can refuse money.
contract JudgedWinner {
    bool public refuses;
    bool public reentered;
    uint256 public secondTry;

    function setRefuses(bool refuses_) external {
        refuses = refuses_;
    }

    function setSecondTry(uint256 id) external {
        secondTry = id;
    }

    receive() external payable {
        if (refuses) revert("no thanks");
        if (secondTry != 0) {
            uint256 id = secondTry;
            secondTry = 0;
            try Judged(payable(msg.sender)).settle(id) {
                reentered = true;
            } catch {}
        }
    }
}

contract JudgedNoReceive {
    function go(EggDare dare) external payable {
        dare.claim{value: msg.value}("proof");
    }
}

contract JudgedNoReceiveNoValue {
    function go(JudgedProbe probe) external returns (uint256) {
        return probe.claim("Paris");
    }
}

/// @notice `Judged` and what `forge test` gives a dev, for free.
contract JudgedStandInTest is Test, JudgedTest {
    event Asked(uint256 indexed id, address indexed by);

    string internal constant PROOF = "https://x.com/alice/status/123";
    address internal claimer = makeAddr("claimer");
    EggDare internal dare;

    function setUp() public {
        dare = new EggDare();
        vm.deal(address(dare), 1 ether);
        vm.deal(claimer, 1 ether);
    }

    function _claim() internal {
        vm.prank(claimer);
        dare.claim{value: 0.002 ether}(PROOF);
    }

    function test_yesPaysAliceOnce() public {
        _claim();
        uint256 id = answerYes();
        dare.settle(id);
        assertEq(dare.alice().balance, 1 ether);
        assertEq(address(dare).balance, 0);

        vm.expectRevert("Judged: not an open question of this contract");
        dare.settle(id);
    }

    function test_noPaysNobody() public {
        _claim();
        dare.settle(answerNo());
        assertEq(dare.alice().balance, 0);
        assertEq(address(dare).balance, 1 ether);
    }

    function test_noAnswerPaysNobody() public {
        _claim();
        dare.settle(answerNone());
        assertEq(dare.alice().balance, 0);
        assertEq(address(dare).balance, 1 ether);
    }

    function test_cantActWhileVoting() public {
        _claim();
        uint256 id = latestQuestion();
        vm.expectRevert("Judged: still voting");
        dare.settle(id);
    }

    function test_aDayOfSilenceEndsInNoAnswerAndCanStillSettle() public {
        JudgedProbe probe = new JudgedProbe(JUDGE_STAND_IN, JUDGE_STAND_IN);
        uint256 id = probe.claim{value: 0.002 ether}(PROOF);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert("Judged: still voting");
        probe.settle(id);
        vm.warp(block.timestamp + 1);
        probe.settle(id);
        assertEq(probe.noneCount(), 1);
    }

    function test_eachAnswerRunsItsOwnHookOnItsOwnId() public {
        JudgedProbe probe = new JudgedProbe(JUDGE_STAND_IN, JUDGE_STAND_IN);
        probe.claim{value: 0.002 ether}("a");
        uint256 yes = answerYes();
        probe.settle(yes);
        probe.claim{value: 0.002 ether}("b");
        uint256 no = answerNo();
        probe.settle(no);
        probe.claim{value: 0.002 ether}("c");
        uint256 none = answerNone();
        probe.settle(none);
        assertEq(probe.yesCount(), 1);
        assertEq(probe.noCount(), 1);
        assertEq(probe.noneCount(), 1);
        assertEq(probe.ran(0), yes);
        assertEq(probe.ran(1), no);
        assertEq(probe.ran(2), none);
    }

    function test_theChangeGoesBackToWhoeverAsked() public {
        _claim();
        assertEq(claimer.balance, 1 ether - 0.0007 ether, "paid only the cost");
        assertEq(address(dare).balance, 1 ether, "the pot paid nothing");
    }

    function test_asksSayWhoAndWhichId() public {
        vm.expectEmit(address(dare));
        emit Asked(1001, claimer);
        _claim();
        assertEq(latestQuestion(), 1001, "ids don't start at a contract's own count");
    }

    function test_aDevsOwnVmTypesWorkBesideIt() public {
        vm.recordLogs();
        _claim();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs[0].emitter, address(dare));
        assertEq(uint256(logs[0].topics[1]), latestQuestion());
    }

    function test_strangersIdsAreRefused() public {
        // Asked on the same Judge by someone else, and answered yes.
        JudgeStandIn(JUDGE_STAND_IN).ask{value: 0.002 ether}("Was I right?", "Yes");
        uint256 stranger = answerYes();
        vm.expectRevert("Judged: not an open question of this contract");
        dare.settle(stranger);
        vm.expectRevert("Judged: not an open question of this contract");
        dare.settle(999);
        assertEq(dare.alice().balance, 0);
    }

    function test_noEthGetsAPlainMessage() public {
        vm.expectRevert("Judged: send ETH with this call, it pays for the question");
        dare.claim(PROOF);
    }

    function test_aFunctionThatIsntPayableGetsThePlainMessage() public {
        JudgedNotPayable forgot = new JudgedNotPayable();
        vm.expectRevert("Judged: send ETH with this call, it pays for the question");
        forgot.claim(PROOF);
    }

    function test_tooLittleEthRevertsAndCostsNothing() public {
        vm.prank(claimer);
        vm.expectRevert(abi.encodeWithSelector(JudgeStandIn.EthShort.selector, 0.0007 ether + 1, 0.0001 ether));
        dare.claim{value: 0.0001 ether}(PROOF);
        assertEq(claimer.balance, 1 ether);
    }

    function test_aStakeStaysAndOnlyTheBudgetsChangeGoesBack() public {
        JudgedStakes stakes = new JudgedStakes();
        vm.deal(address(stakes), 1 ether);
        vm.prank(claimer);
        stakes.claim{value: 0.012 ether}(PROOF);
        assertEq(address(stakes).balance, 1.01 ether, "the pot and the stake");
        assertEq(claimer.balance, 1 ether - 0.01 ether - 0.0007 ether, "paid the stake and the cost");
    }

    function test_spendingPartOfWhatWasSentWithABudgetLeavesThePotWhole() public {
        JudgedReferral referral = new JudgedReferral();
        vm.deal(address(referral), 1 ether);
        address referrer = makeAddr("referrer");
        vm.prank(claimer);
        referral.claim{value: 0.01 ether}(PROOF, referrer);
        assertEq(address(referral).balance, 1 ether, "the pot paid nothing");
        assertEq(referrer.balance, 0.001 ether);
        assertEq(claimer.balance, 1 ether - 0.001 ether - 0.0007 ether);
    }

    function test_aBudgetCantReachPastWhatWasSent() public {
        JudgedStakes stakes = new JudgedStakes();
        vm.deal(address(stakes), 1 ether);
        vm.prank(claimer);
        vm.expectRevert("Judged: budget is more than the ETH sent");
        stakes.claimWithBudget{value: 0.002 ether}(PROOF, 0.003 ether);
        assertEq(address(stakes).balance, 1 ether);
    }

    function test_theBudgetIsTheMostTheSwapCanCost() public {
        JudgedStakes stakes = new JudgedStakes();
        vm.prank(claimer);
        vm.expectRevert(abi.encodeWithSelector(JudgeStandIn.EthShort.selector, 0.0007 ether + 1, 0.0001 ether));
        stakes.claimWithBudget{value: 0.01 ether}(PROOF, 0.0001 ether);
    }

    function test_aBudgetOfNothingGetsThePlainMessage() public {
        JudgedStakes stakes = new JudgedStakes();
        vm.prank(claimer);
        vm.expectRevert("Judged: send ETH with this call, it pays for the question");
        stakes.claimWithBudget{value: 0.002 ether}(PROOF, 0);
    }

    function test_aSecondAskInOneCallCantSpendThePot() public {
        JudgedAsksTwice twice = new JudgedAsksTwice();
        vm.deal(address(twice), 1 ether);
        vm.prank(claimer);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        twice.claim{value: 0.002 ether}(PROOF);
        assertEq(address(twice).balance, 1 ether);
        assertEq(claimer.balance, 1 ether);
    }

    function _multicall(string memory a, string memory b) internal pure returns (bytes[] memory calls) {
        calls = new bytes[](2);
        calls[0] = abi.encodeCall(EggDare.claim, (a));
        calls[1] = abi.encodeCall(EggDare.claim, (b));
    }

    function test_aPayableMulticallCantSpendThePot() public {
        JudgedMulticall multi = new JudgedMulticall();
        vm.deal(address(multi), 1 ether);
        vm.prank(claimer);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        multi.multicall{value: 1 ether}(_multicall("a", "b"));
        assertEq(address(multi).balance, 1 ether);
        assertEq(claimer.balance, 1 ether);
    }

    function test_aMulticallCantGetRoundItWithATrailingByte() public {
        JudgedMulticall multi = new JudgedMulticall();
        vm.deal(address(multi), 1 ether);
        bytes[] memory calls = _multicall("a", "a");
        calls[1] = abi.encodePacked(calls[1], uint8(1));
        vm.prank(claimer);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        multi.multicall{value: 1 ether}(calls);
        assertEq(address(multi).balance, 1 ether);
    }

    function test_aMulticallOfOneStillWorks() public {
        JudgedMulticall multi = new JudgedMulticall();
        vm.deal(address(multi), 1 ether);
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(EggDare.claim, ("a"));
        vm.prank(claimer);
        multi.multicall{value: 0.002 ether}(calls);
        assertEq(address(multi).balance, 1 ether);
        assertEq(claimer.balance, 1 ether - 0.0007 ether);
    }

    function test_askingFromTheChangeIsRefused() public {
        JudgedAsksTwice twice = new JudgedAsksTwice();
        vm.deal(address(twice), 1 ether);
        JudgedSneak sneak = new JudgedSneak(twice);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        sneak.go{value: 0.01 ether}();
        assertEq(address(twice).balance, 1 ether);
    }

    function test_askingFromTheChangeRevertsTheWholeThing() public {
        JudgedBouncer bouncer = new JudgedBouncer();
        vm.expectRevert("Judged: payment failed");
        bouncer.go{value: 0.01 ether}(dare);
        assertEq(address(dare).balance, 1 ether, "the pot paid nothing");
        assertEq(latestQuestion(), 0, "nothing was asked");
    }

    function test_settlingFromTheChangeIsRefused() public {
        JudgedProbe probe = new JudgedProbe(JUDGE_STAND_IN, JUDGE_STAND_IN);
        JudgedSettlesFromChange caller = new JudgedSettlesFromChange(probe);
        uint256 older = caller.ask{value: 0.002 ether}();
        answerYes();
        caller.setOlder(older);
        caller.ask{value: 0.002 ether}();
        assertFalse(caller.got(), "it couldn't settle in the middle of an ask");
        assertEq(probe.yesCount(), 0);
        probe.settle(older);
        assertEq(probe.yesCount(), 1, "and it can after");
    }

    function test_theSameSenderAndValueTwiceInABlockAskOnce() public {
        _claim();
        vm.prank(claimer);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        dare.claim{value: 0.002 ether}("https://x.com/alice/status/456");
        vm.roll(block.number + 1);
        _claim();
        assertEq(claimer.balance, 1 ether - 2 * 0.0007 ether);
    }

    function test_anotherValueInTheSameBlockIsAnotherQuestion() public {
        _claim();
        vm.prank(claimer);
        dare.claim{value: 0.003 ether}("https://x.com/alice/status/456");
        assertEq(claimer.balance, 1 ether - 2 * 0.0007 ether);
    }

    function test_twoPeopleInABlockAreTwoQuestions() public {
        _claim();
        address other = makeAddr("other");
        vm.deal(other, 1 ether);
        vm.prank(other);
        dare.claim{value: 0.002 ether}(PROOF);
        assertEq(latestQuestion(), 1002);
    }

    function test_aCallerThatCantTakeChangeCostsNothing() public {
        JudgedNoReceive caller = new JudgedNoReceive();
        uint256 before = address(this).balance;
        vm.expectRevert("Judged: payment failed");
        caller.go{value: 0.01 ether}(dare);
        assertEq(address(this).balance, before);
        assertEq(address(dare).balance, 1 ether);
        assertEq(latestQuestion(), 0, "nothing was asked");
    }

    function test_thereIsAlwaysChangeAsOnARealPool() public {
        vm.prank(claimer);
        vm.expectRevert(abi.encodeWithSelector(JudgeStandIn.EthShort.selector, 0.0007 ether + 1, 0.0007 ether));
        dare.claim{value: 0.0007 ether}(PROOF);
        vm.prank(claimer);
        dare.claim{value: 0.0007 ether + 1}(PROOF);
        assertEq(claimer.balance, 1 ether - 0.0007 ether);
    }

    function test_aReceiveThatRefusesTheChangeRevertsAndCostsNothing() public {
        JudgedRefusesChange refuses = new JudgedRefusesChange();
        vm.prank(claimer);
        vm.expectRevert(JudgeStandIn.RefundFailed.selector);
        refuses.claim{value: 0.002 ether}(PROOF);
        assertEq(claimer.balance, 1 ether);
    }

    function test_itKnowsWhereJudgeIs() public {
        JudgedWhere where = new JudgedWhere();
        (address judge, address door) = where.where();
        assertEq(judge, JUDGE_STAND_IN);
        assertEq(door, JUDGE_STAND_IN);

        vm.chainId(11155111);
        (judge, door) = where.where();
        assertEq(judge, 0x4958501caedC8E3824c8B6E09EB449f5c97Dbe1D);
        assertEq(door, address(0));
    }

    function test_aYesStaysYesAfterTheDay() public {
        _claim();
        uint256 id = answerYes();
        vm.warp(block.timestamp + 2 days);
        assertEq(uint8(JudgeStandIn(JUDGE_STAND_IN).verdict(id)), uint8(JudgeStandIn.Verdict.Yes));
    }

    function test_anIdNobodyAskedStaysPending() public {
        vm.warp(block.timestamp + 365 days);
        assertEq(uint8(JudgeStandIn(JUDGE_STAND_IN).verdict(999)), uint8(JudgeStandIn.Verdict.Pending));
    }

    function test_calledAgainFromThePayoutItDoesntPayTwice() public {
        JudgedWinner winner = new JudgedWinner();
        JudgedPays pays = new JudgedPays{value: 1 ether}(address(winner));
        pays.claim{value: 0.002 ether}(PROOF);
        uint256 id = answerYes();
        winner.setSecondTry(id);
        pays.settle(id);
        assertEq(address(winner).balance, 1 ether);
        assertFalse(winner.reentered(), "the second settle was refused");
    }

    function test_aSecondYesCantCallInFromThePayout() public {
        JudgedWinner winner = new JudgedWinner();
        JudgedFlagAfterPay prize = new JudgedFlagAfterPay{value: 5 ether}(address(winner));
        prize.claim{value: 0.002 ether}("a");
        uint256 first = answerYes();
        prize.claim{value: 0.002 ether}("b");
        uint256 second = answerYes();
        winner.setSecondTry(second);
        prize.settle(first);
        assertEq(address(winner).balance, 1 ether, "paid once");
        assertFalse(winner.reentered(), "the second question couldn't settle inside the first");
    }

    function test_aWinnerThatRefusesMoneyStaysOpenUntilTheyTakeIt() public {
        JudgedWinner winner = new JudgedWinner();
        winner.setRefuses(true);
        JudgedPays pays = new JudgedPays{value: 1 ether}(address(winner));
        pays.claim{value: 0.002 ether}(PROOF);
        uint256 id = answerYes();
        vm.expectRevert("Judged: payment failed");
        pays.settle(id);
        winner.setRefuses(false);
        pays.settle(id);
        assertEq(address(winner).balance, 1 ether);
    }

    function test_itWontPayNobody() public {
        JudgedPays pays = new JudgedPays{value: 1 ether}(address(0));
        pays.claim{value: 0.002 ether}(PROOF);
        uint256 id = answerYes();
        vm.expectRevert("Judged: paying nobody");
        pays.settle(id);
        assertEq(address(pays).balance, 1 ether, "the pot stays, and the question stays open");
    }

    function test_paysASmartWalletThatTransferWouldStarve() public {
        // A receive that needs far more than transfer's 2300 gas, as a wallet behind a proxy does.
        JudgedWinner winner = new JudgedWinner();
        winner.setSecondTry(type(uint256).max);
        JudgedPays pays = new JudgedPays{value: 1 ether}(address(winner));
        pays.claim{value: 0.002 ether}(PROOF);
        pays.settle(answerYes());
        assertEq(address(winner).balance, 1 ether);
    }

    function test_anAnswerComesFromTheJudgeThatWasAsked() public {
        // A second Judge, whose ids restart: a stranger's yes there has the same number as our open no here.
        address second = makeAddr("second judge");
        vm.etch(second, type(JudgeStandIn).runtimeCode);
        JudgedMoves moves = new JudgedMoves(JUDGE_STAND_IN, JUDGE_STAND_IN);
        uint256 ours = moves.claim{value: 0.002 ether}(PROOF);
        answerNo();
        uint256 theirs = JudgeStandIn(second).ask{value: 0.002 ether}("Was I right?", "Yes");
        assertEq(theirs, ours);
        JudgeStandIn(second).answer(theirs, JudgeStandIn.Verdict.Yes);
        moves.move(second, second);
        moves.settle(ours);
        assertEq(moves.yesCount(), 0, "the no from the Judge it asked");
    }

    function test_anotherChainSaysSo() public {
        vm.chainId(5);
        vm.expectRevert("Judged: Judge isn't on this chain");
        dare.claim{value: 0.002 ether}(PROOF);
    }

    function test_itWontDeployWhereThereIsNoJudge() public {
        vm.chainId(5);
        vm.expectRevert("Judged: Judge isn't on this chain");
        new EggDare();
    }

    function test_fundingTheContractIsAPlainSend() public {
        (bool sent,) = address(dare).call{value: 1 ether}("");
        assertTrue(sent);
        assertEq(address(dare).balance, 2 ether);
    }

    function test_theHelperWontAnswerTwiceOrAfterTheDay() public {
        dare.claim{value: 0.002 ether}(PROOF);
        uint256 first = answerYes();
        vm.expectRevert("JudgeStandIn: that question is over");
        JudgeStandIn(JUDGE_STAND_IN).answer(first, JudgeStandIn.Verdict.No);

        vm.expectRevert("JudgeStandIn: nobody asked that");
        JudgeStandIn(JUDGE_STAND_IN).answer(first + 1, JudgeStandIn.Verdict.Yes);

        dare.claim{value: 0.002 ether}(PROOF);
        uint256 second = latestQuestion();
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert("JudgeStandIn: that question is over");
        JudgeStandIn(JUDGE_STAND_IN).answer(second, JudgeStandIn.Verdict.Yes);
    }

    function test_theHelperMovesTheClockAsAnAnswerWould() public {
        dare.claim{value: 0.002 ether}(PROOF);
        uint256 time = block.timestamp;
        uint256 height = block.number;
        answerYes();
        assertEq(block.timestamp, time + 5 minutes);
        assertEq(block.number, height + 25);
    }

    receive() external payable override {}
}

/// @dev A test that forgot `JudgedTest`: nothing was put at the stand-in's address.
contract JudgedWithoutTheHelperTest is Test {
    function test_saysWhatToDo() public {
        EggDare dare = new EggDare();
        vm.expectRevert("Judged: no Judge at this address. In forge test, inherit JudgedTest");
        dare.claim{value: 0.002 ether}("proof");
    }
}

/// @notice `Judged` on the real `Judge`, the real door and a real pool, and the stand-in held to them.
contract JudgedOnTheRealThingTest is JudgePoolBase {
    JudgedProbe internal probe;

    function setUp() public {
        setUpPool();
        addLiquidity(100 ether);
        probe = new JudgedProbe{value: 1 ether}(address(judge), address(door));
    }

    function _deliverNext(uint256 id, bool yes) internal {
        bytes32 request = lastRequest();
        assertEq(judge.caseOfRequest(request), id);
        assertTrue(deliver(request, attestation(hashOf(request), yes)));
    }

    function test_paysWithEthAndTheChangeComesBack() public {
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        uint256 id = probe.claim{value: 1 ether}("Paris");
        emit log_named_uint("ask through Judged, gas", gasBefore - gasleft());
        uint256 spent = 10 ether - alice.balance;
        assertEq(imd.balanceOf(treasury), PRICE, "the intake was paid its price");
        assertGt(spent, PRICE);
        assertLt(spent, 0.52 ether);
        assertEq(address(probe).balance, 1 ether, "the contract's own money is whole");
        assertEq(address(door).balance, 0);
        assertEq(id, 1);
    }

    function test_aRealYesAndARealNoRunTheirHooksOnce() public {
        vm.prank(alice);
        uint256 yes = probe.claim{value: 1 ether}("Paris");
        vm.expectRevert("Judged: still voting");
        probe.settle(yes);
        _deliverNext(yes, true);
        probe.settle(yes);
        assertEq(probe.yesCount(), 1);
        vm.expectRevert("Judged: not an open question of this contract");
        probe.settle(yes);

        vm.prank(bob);
        uint256 no = probe.claim{value: 1 ether}("London");
        _deliverNext(no, false);
        probe.settle(no);
        assertEq(probe.noCount(), 1);
        assertEq(probe.yesCount(), 1);
    }

    function test_aRefusalAndADayOfSilenceRunNoAnswer() public {
        vm.prank(alice);
        uint256 refused = probe.claim{value: 1 ether}("Paris");
        fail(lastRequest(), 1, "body_refused");
        probe.settle(refused);
        assertEq(probe.noneCount(), 1);

        vm.roll(block.number + 1);
        vm.prank(alice);
        uint256 silent = probe.claim{value: 1 ether}("London");
        vm.warp(block.timestamp + 1 days + 1);
        probe.settle(silent);
        assertEq(probe.noneCount(), 2);
    }

    function test_aQuestionAskedAroundItIsAStrangers() public {
        vm.prank(alice);
        uint256 id = door.ask{value: 1 ether}(RULE, PROOF);
        _deliverNext(id, true);
        vm.expectRevert("Judged: not an open question of this contract");
        probe.settle(id);
        assertEq(probe.yesCount(), 0);
    }

    function test_aPayableMulticallCantSpendThePotOnTheRealDoor() public {
        JudgedMulticallProbe multi = new JudgedMulticallProbe{value: 10 ether}(address(judge), address(door));
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(JudgedProbe.claim, ("Paris"));
        calls[1] = abi.encodeCall(JudgedProbe.claim, ("London"));
        vm.prank(alice);
        vm.expectRevert("Judged: this sender and value already asked in this block");
        multi.multicall{value: 5 ether}(calls);
        assertEq(address(multi).balance, 10 ether);
        assertEq(alice.balance, 10 ether);
    }

    function test_tooLittleEthIsTheDoorsOwnErrorTheStandInsToo() public {
        vm.prank(alice);
        vm.expectPartialRevert(JudgeEthDoor.EthShort.selector);
        probe.claim{value: 0.1 ether}("Paris");
        assertEq(alice.balance, 10 ether);
        assertEq(imd.balanceOf(treasury), 0);
        assertEq(JudgeEthDoor.EthShort.selector, JudgeStandIn.EthShort.selector);
    }

    function test_withoutADoorItPaysInTheToken() public {
        JudgedProbe tokenPays = new JudgedProbe(address(judge), address(0));
        imd.transfer(address(tokenPays), PRICE);
        // ETH sent by mistake goes back, since nothing here spends it.
        vm.prank(alice);
        uint256 id = tokenPays.claim{value: 1 ether}("Paris");
        assertEq(alice.balance, 10 ether);
        assertEq(address(tokenPays).balance, 0);
        assertEq(imd.balanceOf(address(tokenPays)), 0);
        assertEq(imd.balanceOf(treasury), PRICE);
        _deliverNext(id, true);
        tokenPays.settle(id);
        assertEq(tokenPays.yesCount(), 1);
    }

    function test_withoutADoorNoChangeMeansNoCall() public {
        JudgedProbe tokenPays = new JudgedProbe(address(judge), address(0));
        imd.transfer(address(tokenPays), PRICE);
        new JudgedNoReceiveNoValue().go(tokenPays);
        assertEq(imd.balanceOf(treasury), PRICE);
    }

    function test_withoutADoorOrTheTokenItReverts() public {
        JudgedProbe tokenPays = new JudgedProbe(address(judge), address(0));
        vm.expectRevert();
        tokenPays.claim("Paris");
        assertEq(judge.caseCount(), 0);
    }

    /// @dev A test that passes on the stand-in has to mean the same text passes on the real one.
    function test_theStandInRefusesWhatTheRealOneRefuses() public {
        deployCodeTo("JudgedTest.sol:JudgeStandIn", JUDGE_STAND_IN);
        JudgeStandIn standIn = JudgeStandIn(JUDGE_STAND_IN);
        bytes memory tooLongRule = new bytes(501);
        bytes memory tooLongProof = new bytes(651);
        for (uint256 i; i < 651; ++i) {
            if (i < 501) tooLongRule[i] = "a";
            tooLongProof[i] = "a";
        }
        bytes memory longestRule = new bytes(500);
        bytes memory longestProof = new bytes(650);
        for (uint256 i; i < 650; ++i) {
            if (i < 500) longestRule[i] = "a";
            longestProof[i] = "a";
        }
        string memory firstNonAscii = string(bytes.concat(hex"80"));
        string memory lastAscii = string(bytes.concat(hex"7f"));
        string[2][10] memory cases = [
            ["", "proof"],
            ["rule", ""],
            [string(tooLongRule), "proof"],
            ["rule", string(tooLongProof)],
            [unicode"café", "proof"],
            ["rule", unicode"☃"],
            [string(longestRule), string(longestProof)],
            ["with [brackets] and\nnew lines", "fine"],
            [firstNonAscii, "proof"],
            [lastAscii, "proof"]
        ];
        for (uint256 i; i < cases.length; ++i) {
            vm.deal(address(this), 1 ether);
            (bool standInOk, bytes memory standInError) = address(standIn).call{value: 0.002 ether}(
                abi.encodeCall(JudgeStandIn.ask, (cases[i][0], cases[i][1]))
            );
            imd.transfer(address(this), PRICE);
            imd.approve(address(judge), PRICE);
            (bool realOk, bytes memory realError) = address(judge).call(abi.encodeCall(Judge.ask, (cases[i][0], cases[i][1])));
            assertEq(standInOk, realOk, "same outcome");
            if (!realOk) assertEq(standInError, realError, "same error");
        }
    }

    function test_theStandInAndTheRealVerdictNumbersAgree() public pure {
        assertEq(uint8(JudgeStandIn.Verdict.Pending), PENDING);
        assertEq(uint8(JudgeStandIn.Verdict.Yes), YES);
        assertEq(uint8(JudgeStandIn.Verdict.No), NO);
        assertEq(uint8(JudgeStandIn.Verdict.NoAnswer), NO_ANSWER);
    }

    receive() external payable {}
}
