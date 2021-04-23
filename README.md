![Iron Fish](https://user-images.githubusercontent.com/767083/113650890-d8414c80-9645-11eb-8f4d-2427fc322ce4.png)


# Iron Fish

![Node CI](https://github.com/iron-fish/ironfish/actions/workflows/ci.yml/badge.svg)
![Rust CI](https://github.com/iron-fish/ironfish/actions/workflows/rust_ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=fOjPFN18xZ)](https://codecov.io/gh/iron-fish/ironfish)

Iron Fish is a Layer 1 blockchain that provides the strongest privacy guarantees on every single transaction. Leveraging zero-knowledge proofs (zk-SNARKs), and the highest industry standards for encryption.

See https://ironfish.network

## Install

1. Install [Node.js 14.x](https://nodejs.org/en/download/)
1. Install [Rust](https://www.rust-lang.org/learn/get-started).
1. Install [Yarn](https://classic.yarnpkg.com/en/docs/install).
1. Windows:
   1. Install [Build Tools for Visual Studio 2019](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019), including the C++ Build Tools and the Windows 10 SDK, for Rust.
   1. Rust builds also require installing [MinGW-w64 via win-builds](http://win-builds.org/doku.php/download_and_installation_from_windows).
      1. Choose `Native Windows`, `x86_64`, choose an empty directory, and click OK.
      1. On the next screen, click `Process`.
      1. Once it finishes, add the `bin` folder containing `cc` to your path.
1. Install [wasm-pack](https://rustwasm.github.io/wasm-pack/).
1. Run `yarn install` from the root directory to install packages.

## Usage

Once your environment is setup - you can run the CLI by following [these directions](https://github.com/iron-fish/ironfish/tree/master/ironfish-cli).

## Running Tests

1. To test the entire monorepo:
   1. Run `yarn test` at the root of the repository
   1. Run `yarn test:slow` at the root of the repository to run slow tests
   1. Run `yarn test:coverage` at the root of the repository for tests and coverage
1. To test a specific project
   1. Run `yarn test` at the root of the project
   1. Run `yarn test:watch` if you want the tests to run on change
   1. Run `test:coverage:html` if you want to export the coverage in an easy to use format (open the index.html file in the coverage folder of the project )

## Structure of the repository

 - [ironfish](./ironfish/README.md): The library that contains the IronfishSDK and all Ironfish code written in Typescript.
 - [ironfish-cli](./ironfish-cli/README.md): The main client for Iron Fish as of today. It is a command line interface built on Node. More details on [our documentation](https://ironfish.network/docs/onboarding/iron-fish-tutorial).
 - [ironfish-wasm](./ironfish-wasm/README.md): Wrapper for `ironfish-rust` in WASM to be interacted with by the `ironfish` project.
 - [ironfish-rust](./ironfish-rust/README.md): Core API for interacting with the transactions and chain and using ZKP.
 - [ironfish-http-api](./ironfish-http-api/README.md): API hosted on Iron Fish servers for the Iron Fish faucet.
 - [ironfish-rosetta-api](./ironfish-rosetta-api/README.md): API hosted on Iron Fish servers for the block explorer. The code of the block explorer client can be found [here](https://github.com/iron-fish/block-explorer).
