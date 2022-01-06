[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-cli)](https://codecov.io/gh/iron-fish/ironfish)

The main entry point for an Iron Fish CLI that is capable of mining blocks and spending notes. It's created using the [oclif CLI framework](https://oclif.io)

## Starting the CLI

If you're still in the `ironfish` directory in your terminal window, run `cd ironfish-cli`.
   * Otherwise, you'll get a "Command not found" error.

Next, start the CLI with one of these commands:

* Build, run, and restart when the code changes:
   - `yarn start`

* Build, then run the CLI without watching for changes:
   - `yarn start:once`


## Usage Scenarios

### Starting a single node
Run this command in the terminal:
- `yarn start start`

Interact with the node in a new terminal window:
- `yarn start status`
   - Show your node's status
- `yarn start accounts:balance` 
   - Show the balance of your account, including $IRON from blocks you've mined
   - Tentative balance includes all known transactions. Spending balance includes only transactions on blocks on the main chain
- `yarn start faucet`
   - Request a small amount of $IRON for testing payments
- `yarn start accounts:pay`
   - Send $IRON to another account

### Start a node and start mining
Run these commands in two different terminals:

- `yarn start start`       
   - Defaults to port 9033
   - This is equivalent to `yarn start start -d default -p 9033`

- `yarn start miners:start`
   - The default thread count is 1.
   - You can increase the number of threads by adding `--threads <number>`. Use `-1` to autodetect threads based on your CPU cores.
  
   - Examples:
      - `yarn start miners:start --threads 4`
         - To use 4 physical CPU cores
      - `yarn start miners:start --threads -1`
         - To use all the cores on your CPU
         - This may make your machine unresponsive or perform worse than a lesser number.
         - You may want to start with a low thread count and increase it until your hashrate stops increasing.
   - Note: Hyperthreading (2 miner threads per CPU core) is not fully optimized yet

You should see messages in the second terminal indicating that the miner is running:
   - `Starting to mine with 8 threads`
   - `Mining block 6261 on request 1264... \ 1105974 H/s`
      - The H/s number corresponds to the hash rate power of your machine with the given number of mining threads. 
      - Performance reference: 8-core 3.8+ GHz AMD Ryzen 7 4700G with 8 threads gave the above 1.1 M H/s.

When a block is mined, you will see a status line in the node's terminal (the first terminal):
   - `Successfully mined block xxx (6543) has 1 transactions`
   - Mining 1 block can take several hours or days, depending on your machine's hashrate.
   - Your miner may display `Submitting hash for block`, but this does not necessarily mean you've mined a block. The block still needs to be created, validated, and checked to be heavier by the node before it can be added to the main chain.
      - In these cases, your node will display "Discarding block" or "Failed to add block".

### Multiple Nodes

Run these commands in two different terminals:

- `yarn start start -d default -p 9033`
- `yarn start start -d client -p 9034 -b ws://localhost:9033`

You should see connection messages indicating that the two nodes are talking to each other.

### Multiple Nodes with Miners

**Node 1**
```bash
# in tab 1
yarn start:once start

# in tab 2
yarn start:once miners:start
```

**Node 2**
```bash
# in tab 3
yarn start:once start --datadir ~/.ironfish2 --port 9034 --bootstrap ws://localhost:9033

# in tab 4
yarn start:once miners:start --datadir ~/.ironfish2
```
