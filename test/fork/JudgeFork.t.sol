// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Judge} from "../../src/Judge.sol";
import {JudgeEthDoor} from "../../src/JudgeEthDoor.sol";
import {OracleAttestation} from "../../src/OracleAttestation.sol";
import {EggDare} from "../../src/examples/EggDare.sol";
import {JudgeDare} from "../../src/examples/JudgeDare.sol";
import {IIntake} from "../../src/interfaces/IIntake.sol";
import {IJudge} from "../../src/interfaces/IJudge.sol";
import {Intake} from "../support/Intake.sol";

/// @dev The example, pointed at what the fork deployed, until `Judged` has Ethereum's own address.
contract ForkedEggDare is EggDare {
    address private immutable judgeAt;
    address private immutable doorAt;

    constructor(address judge_, address door_) {
        judgeAt = judge_;
        doorAt = door_;
    }

    function _judge() internal view override returns (address, address) {
        return (judgeAt, doorAt);
    }
}

/// @notice `Judge` against what is really deployed: the `Intake`, its token, its treasury and its
/// writer, and on Ethereum IMD's own ETH pool. A case is asked and completed on a fork with the writer
/// impersonated and a stand-in attester, since the real key signs only real answers. Each chain runs
/// only when its RPC is given:
///
///   JUDGE_FORK_RPC_1=... JUDGE_FORK_RPC_11155111=... forge test --match-path test/fork/JudgeFork.t.sol -vv
///
/// The plane itself is not on the fork; this is what the chain does with what its writer sends.
contract JudgeForkTest is Test {
    Intake internal constant INTAKE = Intake(0xa43e6F75ee006411F79Ac1C84120606C2330DE82);
    address internal constant TREASURY = 0x4e0fA57Bde726079356537E2F34d671E9F41ADbc;
    address internal constant WRITER = 0x3d3C0Df7C1a17d384545e9D7C8228897bD9625CB;
    uint256 internal constant PRICE = 0.5 ether;
    /// @dev A stand-in attester: the judge is built trusting it, so the fork can sign answers.
    uint256 internal constant ATTESTER_KEY = 0x0A77E5;
    string internal constant RULE = "The proof must name the capital of France.";
    string internal constant PROOF = "Paris";

    Judge internal judge;
    IERC20 internal token;
    address internal alice = makeAddr("judge fork alice");

    function test_ethereum() public {
        _start(1, 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7);
        _payingWithEth();
        _payingWithTheToken();
        _judgedOnEthereum();
    }

    /// @dev `Judged` as a dev gets it on Ethereum, with no pointing: the addresses in the file are the launched
    /// `Judge` and door. The real attester's key signs only real answers, so the fork ends the question unsigned.
    function _judgedOnEthereum() internal {
        Judge real = Judge(0x37f5E695C1860fF8aec4bf52842020D31699e2eb);
        JudgeEthDoor door = JudgeEthDoor(payable(0xe5A08fA59e9B070bDE8b303e5Dc344937C201bab));
        assertEq(address(door.judge()), address(real), "the door asks the launched Judge");
        assertEq(real.panelSize(), 100);
        assertEq(real.quorum(), 51);
        EggDare dare = new EggDare();
        vm.deal(address(dare), 0.2 ether);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        uint256 claimerBefore = alice.balance;
        uint256 before = real.caseCount();
        vm.prank(alice);
        dare.claim{value: 0.002 ether}(PROOF);
        uint256 id = real.caseCount();
        assertEq(id, before + 1, "one question on the launched Judge");
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, PRICE, "the treasury got one price");
        assertLt(claimerBefore - alice.balance, 0.002 ether, "the change came back");
        assertEq(address(dare).balance, 0.2 ether, "the pot paid nothing");

        vm.expectRevert("Judged: still voting");
        dare.settle(id);
        bytes32 request = _lastRequest();
        vm.prank(WRITER);
        INTAKE.complete(request, 1, bytes32(0), "intake read", abi.encode(request, uint8(1), bytes32("body_refused"), uint16(0), uint16(0), bytes("")));
        dare.settle(id);
        assertEq(address(dare).balance, 0.2 ether, "no answer pays nobody");
    }

    function test_sepolia() public {
        _start(11155111, 0x56bcf2a5F47710649A4091219Ef0b56e2d1B58BF);
        _payingWithTheToken();
        _judgedOnSepolia();
    }

    function _start(uint256 chainId, address token_) internal {
        string memory rpc = vm.envOr(string.concat("JUDGE_FORK_RPC_", vm.toString(chainId)), string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);
        assertEq(block.chainid, chainId);
        token = IERC20(token_);
        judge = new Judge(vm.addr(ATTESTER_KEY), IIntake(address(INTAKE)), token, 100, 51);
        vm.deal(alice, 1 ether);
    }

    function _payingWithEth() internal {
        JudgeEthDoor door = new JudgeEthDoor(judge, token, IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90), 10_000, 200);
        // The address a test deploys to can hold dust on a live chain; what matters is what a case leaves.
        vm.deal(address(door), 0);
        deal(address(token), address(door), 0);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        uint256 id = door.ask{value: 0.01 ether}(RULE, PROOF);
        emit log_named_uint("ask in ETH, gas", gasBefore - gasleft());
        uint256 spent = 1 ether - alice.balance;
        emit log_named_uint("ask in ETH, wei spent on the price", spent);
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, PRICE, "the treasury got one price");
        assertLt(spent, 0.01 ether, "the rest came back");
        assertEq(address(door).balance, 0);
        assertEq(token.balanceOf(address(door)), 0);
        _answer(id, _lastRequest(), true);
        assertEq(uint8(judge.verdict(id)), uint8(IJudge.Verdict.Yes));

        // The worked example on the same pool: a claim, a yes, and the pot to the claimant.
        JudgeDare dare = new JudgeDare{value: 0.2 ether}(door, RULE, block.timestamp + 7 days);
        uint256 pot = address(dare).balance;
        vm.prank(alice);
        uint256 claim = dare.claim{value: 0.01 ether}(PROOF);
        assertEq(address(dare).balance, pot + pot / 100, "the pot and the stake");
        _answer(claim, _lastRequest(), true);
        uint256 before = alice.balance;
        dare.collect(claim);
        assertEq(alice.balance, before + pot + pot / 100);

        _judgedWithEth(door);
    }

    /// @dev What the page shows, on IMD's real pool: ask with a little ETH, a real delivery, then settle.
    function _judgedWithEth(JudgeEthDoor door) internal {
        ForkedEggDare dare = new ForkedEggDare(address(judge), address(door));
        vm.deal(address(dare), 0.2 ether);
        uint256 winnerBefore = dare.alice().balance;
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        uint256 claimerBefore = alice.balance;
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        dare.claim{value: 0.002 ether}(PROOF);
        emit log_named_uint("ask through Judged, gas", gasBefore - gasleft());
        emit log_named_uint("ask through Judged, wei spent on the price", claimerBefore - alice.balance);
        assertLt(claimerBefore - alice.balance, 0.002 ether, "the change came back");
        assertEq(address(dare).balance, 0.2 ether, "the pot paid nothing");
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, PRICE, "the treasury got one price");
        uint256 id = judge.caseCount();

        vm.expectRevert("Judged: still voting");
        dare.settle(id);
        _answer(id, _lastRequest(), true);
        dare.settle(id);
        assertEq(dare.alice().balance - winnerBefore, 0.2 ether, "a yes paid alice");
        vm.expectRevert("Judged: not an open question of this contract");
        dare.settle(id);
    }

    /// @dev `Judged` as a dev gets it on Sepolia, with no pointing: the address in the file is the real `Judge`.
    function _judgedOnSepolia() internal {
        Judge real = Judge(0x4958501caedC8E3824c8B6E09EB449f5c97Dbe1D);
        assertEq(address(real.asset()), address(token));
        EggDare dare = new EggDare();
        vm.deal(address(dare), 0.2 ether);
        deal(address(token), address(dare), PRICE);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        vm.prank(alice);
        dare.claim(PROOF);
        assertEq(token.balanceOf(address(dare)), 0, "it paid in the token it held");
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, PRICE);
        uint256 id = real.caseCount();

        vm.expectRevert("Judged: still voting");
        dare.settle(id);
        bytes32 request = _lastRequest();
        vm.prank(WRITER);
        INTAKE.complete(request, 1, bytes32(0), "intake read", abi.encode(request, uint8(1), bytes32("body_refused"), uint16(0), uint16(0), bytes("")));
        dare.settle(id);
        assertEq(address(dare).balance, 0.2 ether, "no answer pays nobody");
    }

    function _payingWithTheToken() internal {
        deal(address(token), alice, PRICE);
        uint256 treasuryBefore = token.balanceOf(TREASURY);
        vm.startPrank(alice);
        token.approve(address(judge), PRICE);
        uint256 gasBefore = gasleft();
        uint256 id = judge.ask(RULE, PROOF);
        emit log_named_uint("ask in the token, gas", gasBefore - gasleft());
        vm.stopPrank();
        assertEq(token.balanceOf(TREASURY) - treasuryBefore, PRICE, "the treasury got one price");
        assertEq(token.balanceOf(alice), 0);
        _answer(id, _lastRequest(), false);
        assertEq(uint8(judge.verdict(id)), uint8(IJudge.Verdict.No));

        // And a refusal reaches the failure function under the live stipend.
        deal(address(token), alice, PRICE);
        vm.startPrank(alice);
        token.approve(address(judge), PRICE);
        uint256 refused = judge.ask(RULE, PROOF);
        vm.stopPrank();
        bytes32 request = _lastRequest();
        vm.prank(WRITER);
        INTAKE.complete(request, 1, bytes32(0), "intake read", abi.encode(request, uint8(1), bytes32("body_refused"), uint16(0), uint16(0), bytes("")));
        assertEq(uint8(judge.verdict(refused)), uint8(IJudge.Verdict.NoAnswer));
    }

    /// @dev The intake's id for the request just made: what the writer completes.
    function _lastRequest() internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(INTAKE), INTAKE.nonce()));
    }

    /// @dev The writer delivers a signed answer; the callback must finish inside the live stipend.
    function _answer(uint256 id, bytes32 request, bool yes) internal {
        (,, bytes32 questionHash) = judge.cases(id);
        OracleAttestation.Attestation memory a = OracleAttestation.Attestation({
            requestId: keccak256(abi.encode("oracle request", request)),
            chainId: block.chainid,
            questionHash: questionHash,
            answerType: OracleAttestation.ANSWER_BOOL,
            answer: abi.encode(yes),
            figure: 0,
            fromBlock: 100,
            toBlock: 100,
            blockHash: keccak256("block"),
            panelJobId: keccak256("panel job"),
            panelSize: 100,
            quorum: 51,
            agreed: 51,
            issuedAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + 1 hours)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_KEY, judge.attestationDigest(a));
        vm.recordLogs();
        vm.prank(WRITER);
        INTAKE.complete(request, 0, keccak256("attestation"), "attestation url", abi.encode(request, a, abi.encodePacked(r, s, v)));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (,,, bool delivered) = abi.decode(logs[logs.length - 1].data, (uint8, bytes32, string, bool));
        assertTrue(delivered, "the callback ran to the end under the live stipend");
    }
}
