[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-rust)](https://codecov.io/gh/iron-fish/ironfish)

This is the core API for interacting with transactions and the chain. It's essentially a facade to a lot of different projects.

This layer is tangentially aware of the chain. It is not aware of the peer-to-peer network or client APIs.
