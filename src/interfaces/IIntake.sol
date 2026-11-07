// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title The part of IMD's `Intake` a consumer calls
/// @notice The live contract is `0xa43e6f75ee006411f79ac1c84120606c2330de82` on Ethereum, Robinhood
/// Chain and Sepolia. It takes the payment, forwards it to IMD's treasury in the same call, and
/// emits the body for the plane to read. Nothing is escrowed or refunded.
interface IIntake {
    struct Callback {
        address target;
        bytes4 selector;
    }

    function priceOf(bytes32 action, address asset) external view returns (uint256);

    function requestWithFailure(
        bytes32 action,
        bytes calldata body,
        Callback calldata callback,
        bytes4 onFailure,
        address asset,
        uint256 amount
    ) external payable returns (bytes32 requestId);
}
