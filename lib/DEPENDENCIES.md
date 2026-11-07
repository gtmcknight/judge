# Vendored dependencies

Copied in at an exact commit rather than installed as git submodules, and committed to this repository, so a build never reaches the network and its inputs can't change between review and deployment.

`.git` is removed from each so they are ordinary files here. Tests, docs, audits, scripts and npm lockfiles are stripped: nothing in them is compiled.

| Dependency | Commit | Why it is here |
| --- | --- | --- |
| `openzeppelin-contracts` | `cab19933c33c2ad1d4c7a84864a3601dddfd16f3` (v5.7.0) | `IERC20`, `SafeERC20`, `Strings` and the signature checks in `Judge` |
| `v4-core` | `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` | The pool interfaces `JudgeEthDoor` swaps through. `PoolManager` for the unit tests |
| `forge-std` | `8e40513d678f392f398620b3ef2b418648b33e89` (v1.11.0) | Tests only. Nothing in `src/` imports it |
| `solmate` | `89365b880c4f3c786bdd453d4b8e8fe410344a69` | `Owned`, which `v4-core`'s `ProtocolFees` imports |

`v4-core`'s `remappings.txt` is removed too. Forge reads it from inside a dependency, so `forge install gtmcknight/judge` would add `@openzeppelin/=lib/judge/lib/v4-core/lib/openzeppelin-contracts/`, a folder that isn't here, to the installer's project and break their own OpenZeppelin imports. Nothing here needs it, since `foundry.toml` sets the remappings.

Updating one of these is a deliberate change with its own review, not a `forge update`.
