![Iron Fish](https://user-images.githubusercontent.com/767083/113650890-d8414c80-9645-11eb-8f4d-2427fc322ce4.png)


# Iron Fish

The monorepo for all Iron Fish TypeScript & Rust code.

See https://ironfish.network

[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V)](https://codecov.io/gh/iron-fish/ironfish)

## Development

### Initial setup

1. Install [Node.js 14.x](https://nodejs.org/en/download/)
1. (Windows) Install [Build Tools for Visual Studio 2019](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019), including the C++ Build Tools and the Windows 10 SDK, for Rust.
1. (Windows) Rust builds also require installing [MinGW-w64 via win-builds](http://win-builds.org/doku.php/download_and_installation_from_windows).
    * Choose `Native Windows`, `x86_64`, choose an empty directory, and click OK.
    * On the next screen, click `Process`.
    * Once it finishes, add the `bin` folder containing `cc` to your path.
1. Install [Rust](https://www.rust-lang.org/learn/get-started).
1. Install [yarn](https://classic.yarnpkg.com/en/docs/install).
1. Run `cargo install wasm-pack` to install the WebAssembly wrapper generator.
1. Run `yarn` from the root directory to install packages.

### Usage
Once your environment is setup - you can run the CLI by following [these directions](https://github.com/iron-fish/ironfish/tree/master/ironfish-cli).

### Tests
Slow tests that are going to be memory intensive should use the extension `test.slow.ts` they will be run in a separate CI.

#### Running Tests
1. To test the entire monorepo:
  a. Run `yarn test` at the root of the repository
  b. Run `yarn test:coverage` at the root of the repository for test and coverage
  b. Run `yarn test:slow:coverage` at the root of the repository to include slow tests
2. To test a specific project
  a. Run `yarn test` at the root of the project
  b. Run `yarn test:watch` if you want the tests to run on change
  c. Run `test:coverage:html` if you want to export the coverage in an easy to use format (open the index.html file in the coverage folder of the project )

### Structure of the repository

Here's an overview of the main packages in the repository

#### ironfish-cli:
- The main client for Iron Fish as of today. It is a command line interface based on Node. Allows to sync a full node, start mining, and send or receive payments. More details on [our documentation](https://ironfish.network/docs/onboarding/iron-fish-tutorial).

#### ironfish-http-api:
- API hosted on Iron Fish servers for the Iron Fish faucet.

#### ironfish-rosetta-api:
- API hosted on Iron Fish servers for the block explorer. The code of the block explorer client can be found [here](https://github.com/iron-fish/block-explorer).

#### ironfish-rust:
- Core API for interacting with the transactions and chain and using ZKP.

#### ironfish-wasm:
- Rust wrapper for creating accounts and transactions to be converted into WASM.

#### ironfish:
- `anchorChain` maintains the two global merkle trees of notes and
  nullifiers and keeps those trees in sync with the heaviest chain.
  "In sync" means that the commitments stored on the head of the heaviest
  chain in the blockchain are the roots of the merkle trees at the time
  the block was added.
- `network` is a general-purpose p2p library that supports gossip and
  Rpc style messages. It is an opinionated library that runs primarily
  over WebRTC with support from websockets. It can be run in either
  a node or browser environment.
- `captain` is a coordination library that is primarily responsible for
  using network messages to maintain the trees and blockchain.
- `ironfish` is the ironfish node library that uses captain to interact
  with the ironfish p2p network for mining blocks, and spending notes. It also contains the account store and config.
