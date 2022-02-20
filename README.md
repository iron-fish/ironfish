![Iron Fish](https://user-images.githubusercontent.com/767083/113650890-d8414c80-9645-11eb-8f4d-2427fc322ce4.png)

# Iron Fish

![Node CI](https://github.com/iron-fish/ironfish/actions/workflows/ci.yml/badge.svg)
![Rust CI](https://github.com/iron-fish/ironfish/actions/workflows/rust_ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=fOjPFN18xZ)](https://codecov.io/gh/iron-fish/ironfish)

Iron Fish is a Layer 1 blockchain that provides the strongest privacy guarantees on every single transaction. Leveraging zero-knowledge proofs (zk-SNARKs), and the highest industry standards for encryption.

See https://ironfish.network

## Install

1. Install [Node.js 16.x](https://nodejs.org/en/download/)
1. Install [Rust](https://www.rust-lang.org/learn/get-started).
1. Install [Yarn](https://classic.yarnpkg.com/en/docs/install).
1. Windows:
   1. Install [Build Tools for Visual Studio 2019](https://docs.microsoft.com/en-us/visualstudio/releases/2019/history#release-dates-and-build-numbers), including the C++ Build Tools and the Windows 10 SDK, for Rust.
   1. Rust builds also require installing [MinGW-w64 via win-builds](http://win-builds.org/doku.php/download_and_installation_from_windows).
      1. Choose `Native Windows`, `x86_64`, choose an empty directory, and click OK.
      1. On the next screen, click `Process`.
      1. Once it finishes, add the `bin` folder containing `cc` to your PATH environment variable.
1. Run `yarn install` from the root directory to install packages.
   - If `yarn install` fails with an error that includes "Failed to build cmake", you may need to first install cmake. For example, on macOS:
     1. Run `brew install cmake`, you'll need cmake version 3.15 or higher.

   - If `yarn install` fails with an error that includes "Could NOT find OpenSSL", you may need to first install OpenSSL and add an environment variable. For example, on macOS:
     1. Run `brew install openssl`
     1. Run `` export OPENSSL_ROOT_DIR=`brew --prefix openssl`  ``
     1. Run `yarn install` again.

   - If `yarn install` fails with an error that includes "Error: not found: make", "make: cc: Command not found", or "make: g++: Command not found", you may need to [install a C/C++ compiler toolchain](https://github.com/nodejs/node-gyp#on-unix).
     1. On Ubuntu: `apt install build-essential`
     1. On Amazon Linux: `sudo yum groupinstall "Development Tools"`

   - If `yarn install` fails with an error that includes "Error: Could not find any Python installation to use", you may need to install Python3 (required by node-gyp). on MacOS:
     1. Run `brew install python`

## Usage

Once your environment is setup - you can run the CLI by following [these directions](https://github.com/iron-fish/ironfish/tree/master/ironfish-cli).

## Running Tests

1. To test the entire monorepo:
   1. Run `yarn test` at the root of the repository
   1. Run `yarn test:slow` in ./ironfish/ to run slow tests
   1. Run `yarn test:coverage` at the root of the repository for tests and coverage
1. To test a specific project
   1. Run `yarn test` at the root of the project
   1. Run `yarn test:watch` in ./ironfish or ./ironfish-cli if you want the tests to run on change
   1. Run `yarn test:coverage:html` if you want to export the coverage in an easy to use format (open the index.html file in the coverage folder of the project)

## Structure of the repository

- [ironfish](./ironfish/README.md): The library that contains the IronfishSDK and all Ironfish code written in TypeScript.
- [ironfish-cli](./ironfish-cli/README.md): The main client for Iron Fish as of today. It is a command-line interface built on Node. More details in [our documentation](https://ironfish.network/docs/onboarding/iron-fish-tutorial).
- [ironfish-rust](./ironfish-rust/README.md): Core API for interacting with the transactions and chain and using ZKP.
- [ironfish-rust-nodejs](./ironfish-rust-nodejs/README.md): Wrapper for `ironfish-rust` as a native NodeJS addon.
- [ironfish-rust-wasm](./ironfish-rust-wasm/README.md): Wrapper for `ironfish-rust` in WASM.
- [ironfish-graph-explorer](./ironfish-graph-explorer/README.md): A visual tool to explore the block chain and all of its forks.

## Other Repositories

- [iron-fish/homebrew-brew](https://github.com/iron-fish/homebrew-brew): Contains brew formula for installing via the [Brew](https://brew.sh) package manager
- [iron-fish/website](https://github.com/iron-fish/website): The repo that powers [ironfish.network](https://ironfish.network)
