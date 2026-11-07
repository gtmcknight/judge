// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Judge} from "../../src/Judge.sol";
import {JudgeEthDoor} from "../../src/JudgeEthDoor.sol";
import {IIntake} from "../../src/interfaces/IIntake.sol";

/// @notice Deploys `Judge`, and on Ethereum its ETH door. Nothing has an owner: what this deploys is what
/// it stays.
///
///   forge script test/support/DeployJudge.s.sol --rpc-url $RPC                                    # rehearse
///   forge script test/support/DeployJudge.s.sol --rpc-url $RPC --broadcast --private-key $KEY
///
/// Optional environment:
///   JUDGE_PANEL_SIZE   seats a case opens; defaults to 100, the paid door's cap, at one price.
///   JUDGE_QUORUM       seats that must agree; defaults to a bare majority of the panel.
contract DeployJudge is Script {
    IIntake internal constant INTAKE = IIntake(0xa43e6F75ee006411F79Ac1C84120606C2330DE82);
    address internal constant ORACLE_SIGNER = 0x5598Aa9146215Bc13eb26f2c692Ad1461Fd32982;

    function run() external returns (Judge judge) {
        uint256 panelSize = vm.envOr("JUDGE_PANEL_SIZE", uint256(100));
        uint256 quorum = vm.envOr("JUDGE_QUORUM", panelSize / 2 + 1);

        IERC20 asset;
        if (block.chainid == 1) asset = IERC20(0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7);
        else if (block.chainid == 11155111) asset = IERC20(0x56bcf2a5F47710649A4091219Ef0b56e2d1B58BF);
        else revert("no Judge on this chain");

        vm.startBroadcast();
        judge = new Judge(ORACLE_SIGNER, INTAKE, asset, uint16(panelSize), uint16(quorum));
        console.log("Judge  ", address(judge));
        if (block.chainid == 1) {
            JudgeEthDoor door = new JudgeEthDoor(judge, asset, IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90), 10_000, 200);
            console.log("Door   ", address(door));
        }
        vm.stopBroadcast();
    }
}
