// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {IJudge} from "./interfaces/IJudge.sol";

/// @title Open a case on `Judge` with ETH
/// @notice Optional, and kept apart so `Judge` itself never touches a pool. `ask` buys exactly the case's
/// price in the token's own ETH pool, opens the case and sends back the ETH that did not cost, so a
/// contract calling it needs a `receive`. Attach little: what is attached is the most the swap can cost.
/// It holds nothing between calls, and if the pool ever moves, a new door costs `Judge` nothing.
contract JudgeEthDoor is IUnlockCallback {
    using SafeERC20 for IERC20;

    error NotThePoolManager();
    error EthShort(uint256 needed, uint256 sent);
    error IncompleteSwap();
    error RefundFailed();

    IJudge public immutable judge;
    IERC20 public immutable asset;
    IPoolManager public immutable poolManager;
    uint24 public immutable poolFee;
    uint24 public immutable poolTickSpacing;

    /// @dev Plain arguments, in a constructor that calls nothing, as a launch through IMD's factory needs.
    constructor(IJudge judge_, IERC20 asset_, IPoolManager poolManager_, uint24 poolFee_, uint24 poolTickSpacing_) {
        judge = judge_;
        asset = asset_;
        poolManager = poolManager_;
        poolFee = poolFee_;
        poolTickSpacing = poolTickSpacing_;
    }

    function ask(string calldata rule, string calldata proof) external payable returns (uint256 id) {
        uint256 price = judge.price();
        uint256 spent = abi.decode(poolManager.unlock(abi.encode(price, msg.value)), (uint256));
        asset.forceApprove(address(judge), price);
        id = judge.ask(rule, proof);
        // The last thing an ask does, with everything written: a caller that opens another case from its
        // `receive` only opens another case, on its own money.
        if (msg.value != spent) {
            // slither-disable-next-line arbitrary-send-eth,low-level-calls
            (bool ok,) = msg.sender.call{value: msg.value - spent}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @dev Swaps for exactly the price and settles it. The pool manager calls back only whoever called
    /// `unlock`, and only `ask` does here.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotThePoolManager();
        (uint256 price, uint256 sent) = abi.decode(data, (uint256, uint256));
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(asset)), poolFee, int24(poolTickSpacing), IHooks(address(0))
        );
        // A positive amount is an exact output in v4, and a pool short of liquidity fills only part of it.
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: int256(price), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            ""
        );
        if (uint256(int256(delta.amount1())) != price) revert IncompleteSwap();
        uint256 spent = uint256(-int256(delta.amount0()));
        if (spent > sent) revert EthShort(spent, sent);
        // Clears any token left synced earlier in this transaction, which native settlement refuses.
        poolManager.sync(key.currency0);
        // slither-disable-next-line unused-return
        poolManager.settle{value: spent}();
        poolManager.take(key.currency1, address(this), price);
        return abi.encode(spent);
    }
}
