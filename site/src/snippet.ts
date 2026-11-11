/** What a dev runs and pastes. Each use's contract and test come from examples.gen.ts. */

export const INSTALL = "forge install gtmcknight/judge";

/** The examples that put the caller's address in the question use OpenZeppelin's `Strings`. */
export const INSTALL_WITH_OZ = "forge install gtmcknight/judge OpenZeppelin/openzeppelin-contracts";

const FILE_TOP = ["// SPDX-License-Identifier: MIT", "pragma solidity ^0.8.20;", ""];

/** The whole file, which compiles as it lands. */
export const asFile = (lines: readonly string[]) => [...FILE_TOP, ...lines, ""].join("\n");
