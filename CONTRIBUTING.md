# Contributing

We welcome contributions from anyone on the internet, and are grateful for even a one-word correction! Note that we have a [code of conduct](./CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.

Before you start, you should become familiar with pulling the code down locally, building the code, and running the tests. If you want more information you can visit our [install guide](https://github.com/iron-fish/ironfish#install), or [how to run tests](https://github.com/iron-fish/ironfish#running-tests).

Thanks in advance for your help.

# Contributor Workflow

Pull requests are the best way to propose a new change to the codebase.

1. Fork the repo
1. Create a branch from `staging`
1. Open a pull request against `staging`

Once the PR is created, one of the maintainers will review it and merge it. Add the right labels to your pull request. Reference any bugs you're fixing with single lines of the form `Fix #123`

**NOTE:** Read [You should open a FIP if](#you-should-open-a-fip-if), if you are thinking of working on a complex change.

# Where to start

Please read our [README.md](./README.md) first, to learn how to set up Iron Fish.

If you don't know what contribution you can work on, here are a few suggestions:
* Take a look at our current [list of issues](https://github.com/iron-fish/ironfish/issues). Update the issue if you are interested in working on it.
* Take a look at our current [pull requests](https://github.com/iron-fish/ironfish/pulls) and help review them.
* Help us add new tests. More testing allows everyone to ship quality code faster.
* Write documentation or fix the existing documentation
* If you still don't know what could be a good task for you, do not hesitate to contact us.

# Fish Improvement Proposal (FIP)

The purpose of a FIP is to explain an improvement you would like to make to Iron Fish, and get consensus from the core development team of Iron Fish. The reason is that we want to make sure your change fits inside of the product vision, and that you don't try to fix a bug in a piece of code already being refactored.

You can submit a FIP by filing an issue here: https://github.com/iron-fish/ironfish/issues/new/choose

## You should open a FIP if

If you are working on something in one of these categories, we will not accept your PR if you don't open a Fish Improvement Proposal (FIP).

 - #### Upgrading Package Versions
   - This is a common attack vector by malicious agents. We lock down our packages for this very reason, and only allow the core team to upgrade packages unless you submit a FIP first explaining why you want to upgrade the package.
 - #### Upgrading Node Versions
   - There is a large impact in upgrading node versions. Iron Fish takes advantage of many experimental node features, some of which are not fully fleshed out. We use workers and native code boundaries. Node is also known to introduce bugs in newer versions, even LTS. Because of this, there is production testing we do on our side when upgrading node to ensure it's compatible. Because of this, we don't allow users to upgrade our node versions unless a FIP is filed.
 - #### Refactor a core system
   - Often engineers have visions for core systems, and may be in the process of changing them. FIP's help avoid overlap and having your changes overwritten. Some core systems include: MerkleTree, Blockchain, PeerNetwork, Verifier, and Consensus.
 - #### Making new product design decisions that have no precedent
   - This one is more complicated. If our product works one way, and you open a PR to change the core product principles to work in another way, then we are going to close your PR as it does not fit into our vision. Try to match existing precedent as much as possible in your code.
 - #### Tests for CLI commands
   - They are not useful in their current form. Most of these tests are mocking out the entire node and sending back handcrafted values which are merely asserted and make changes to these commands more annoying. We are accepting a FIP for refactoring command tests to be more valuable and not use mocking.


# Contact Us

In case of problems with trying to contribute to Iron Fish, you can contact us:
* On [Discord](https://discord.gg/ironfish)
* Via [email](mailto:contact@ironfish.network)
