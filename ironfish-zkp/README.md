# ironfish-zkp

This is the foundation of the Iron Fish project that knows about the
[Sapling](https://github.com/zcash/librustzcash/tree/master/zcash_primitives/src/sapling)
API and its zero-knowledge [proving mechanism](https://github.com/zcash/librustzcash/tree/master/zcash_proofs/src/sapling).

Iron Fish uses the BLS12 curve.

Much of the code here was originally forked from https://github.com/zcash/librustzcash

Anything that hasn't been forked is re-exported so that this is the main entry point for any related code. No other crates should have a librustzcash dependency.
