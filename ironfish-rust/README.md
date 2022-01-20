[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-rust)](https://codecov.io/gh/iron-fish/ironfish)

This is the core API for interacting with transactions and the chain. It's essentially a facade to a lot of different projects.

This is the only Iron Fish project that knows about the
[Sapling](https://github.com/zcash/librustzcash/tree/master/zcash_primitives/src/sapling)
API and its zero knowledge [proving mechanism](https://github.com/zcash/librustzcash/tree/master/zcash_proofs/src/sapling).

There are theoretically different kinds of elliptical curves that can be used with Sapling, but we are currently
depending on the BLS12 curve. Everything in ironfish-rust is parameterized on the curve type, but there
are easy facades exported from sapling::bls12 for the different struct types.

This layer is tangentially aware of the chain. It is not aware of the peer to peer network or client APIs.
