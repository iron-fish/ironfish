[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-rust)](https://codecov.io/gh/iron-fish/ironfish)

This is the core API for interacting with transactions and the chain. It's essentially a facade to a lot of different projects.

This layer is tangentially aware of the chain. It is not aware of the peer-to-peer network or client APIs.

## Building

This library requires Sapling parameters to be present prior to compilation.

1. Use the `download-params` feature-flag to download the Iron Fish parameters from [Github](https://github.com/iron-fish/ironfish/tree/master/ironfish-rust/src/sapling_params) at compile-time.
2. Bring your own params files and put them in your src folder. You can download them from the Github link above and add them to your repo manually, if you prefer. They must be present at `./src/sapling_params/sapling_{spend | output | mint}.params`
   ```bash
   $ ls ./src/sapling_params
   sapling-mint.params     sapling-output.params   sapling-spend.params
   ```
