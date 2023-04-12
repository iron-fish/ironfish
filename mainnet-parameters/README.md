# Mainnet Parameters
This [params](./params) file contains the final parameters for Iron Fish mainnet along with a list of contribution hashes for each contribution of the trusted setup ceremony. To verify the parameters you can run the rust code found in [ironfish-mpc](../ironfish-mpc).

## Verification
The output of this will be the list of 2870 hashes of the public contributions from the trusted setup ceremony. If you'd like to test that the public hash of your contribution made it in to the final params you can verify by looking for it in this list.
```bash
cd ironfish-mpc
cargo run --bin verify --features="verification" --release
```

## Generating Mainnet Params
This command will separate the 3 circuits (spend, output, mint) from the params file. These are the parameters used by ironfish nodes running on mainnet.

```bash
cd ironfish-mpc
cargo run --bin split_params --release
```
