# Contributing

Thank you for considering contributing to the Iron Fish project. We want to make contributing to this project as easy and transparent as possible, whether it's about:

* Discussing the current state of the code
* Documenting the code
* Reporting a bug
* Reporting a security threat
* Submitting a fix
* Suggesting a new feature

We welcome contributions from anyone on the internet, and are grateful for even a one-word correction! Note that we have a [code of conduct](./CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.


Thanks in advance for your help.


## We develop with GitHub

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.


## Pull Requests Guidelines

Pull requests are the best way to propose a new change to the codebase (we use the classic [GitHub Flow](https://guides.github.com/introduction/flow/index.html)).

To create a new pull request:
1. Fork the repo and check out a new branch from `staging`.
2. Add test - if your code change doesn't require a test change, please explain why in the PR description.
   * To run tests from a specific .test.ts file, run `yarn test NAME` where your tests are in NAME.test.ts
3. Update the documentation - Especially if you've changed APIs or created new functions.
4. Ensure the entire test suite passes by running `yarn test`.
5. Make sure your code lints by running `yarn lint`.
6. Once 4 & 5 are passing, create a new pull request on GitHub targeted at the `staging` branch.
7. Add the right label to your PR `documentation`, `bug`, `security-issue`, or `enhancement`.
8. Add a description of what the PR is changing:
   * What problem is the PR solving
   * References to any bugs you're fixing with single lines of the form `Fix #123`
   * Explain if it's adding a breaking change for clients
   * Explain how you've tested your change

Once the PR is created, one of the maintainers will review it and merge it into the master branch.

If you are thinking of working on a complex change, do not hesitate to discuss the change you wish to make via a GitHub Issue. You can also request feedback early, by opening a WIP pull request or discuss with a maintainer to ensure your work is in line with the philosophy and roadmap of Iron Fish.


## Where to start

Please read our [README.md](./README.md) first, to learn how to set up Iron Fish.

If you don't know what contribution you can work on, here are a few suggestions:
* Take a look at our current [list of issues](https://github.com/iron-fish/ironfish/issues). Update the issue if you are interested in working on it.
* Take a look at our current [pull requests](https://github.com/iron-fish/ironfish/pulls) and help review them.
* Help us add new tests. More testing allow everyone to ship quality code faster.
* Write documentation or fix the existing documentation
* If you still don't know what could be a good task for you, do not hesitate to contact us.


## Testing

For our TypeScript codebase, you can run the entire test suite using `yarn test` in the root directory.

For our Rust codebase, you can run the test suites for each project by running `cargo test` in the project directory.

## Continuous integration

After creating a PR on GitHub, the code will be tested automatically by GitHub Action. The tests can take up to 15 minutes to pass. We ask you to test your code on your machine before submitting a PR.


## Style Guide

Iron Fish uses `eslint` and `prettier` to maintain consistent formatting on the TypeScript codebase.
For the Rust codebase, we are using `rustfmt`.

Please run it before submitting a change.


# Licensing

Any contribution will be under the [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/) Software License.
When you submit a code change, your submissions are understood to be under the same license that covers the project.

Please contact us if this a concern for you.


# Contact Us

In case of problems with trying to contribute to Iron Fish, you can contact us:
* On [Discord](https://discord.gg/ironfish)
* Via [email](contact@ironfish.network)
