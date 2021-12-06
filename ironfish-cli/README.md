[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-cli)](https://codecov.io/gh/iron-fish/ironfish)

The main entry point for an Iron Fish CLI that is capable of mining blocks and spending notes. It's created using the [oclif CLI framework](https://oclif.io)

## Starting the CLI

If you're still in the 'ironfish" directory in your terminal window, 
- `cd ironfish-cli`
   - Otherwise, 'yarn start' won't be found and you'll get an error.
   - Ironfish-cli is one level below the ironfish directory in the source tree.
   - In Windows, it's typically in: 
      - C:\users\<your-user-name>\source\repos\ironfish\ironfish-cli
   - Yarn uses the start and start:once commands in ironfish-cli\package.json

CLI Actions:

Build, run, and restart when the code changes:

- `yarn start`

Build, then run the CLI without watching for changes:

- `yarn start:once`


## Use Scenarios

### Starting a single node
Run this command in the terminal:
- `yarn start start`

Interact with the node in a new tab or terminal window:
- `yarn start status`
   - Show your Node's status
- `yarn start accounts:balance` 
   - Show the number of Iron you've mined: tentative and confirmed
   - You earn 20 Iron per confirmed block you mined
- `yarn start faucet:giveme`
   - Request a small amount of Iron Ore for testing payments
- `yarn start accounts:pay`
   - Pay Iron to another account

### Start a Node and start Mining
Run these commands in two different terminals:

- `yarn start start`       
   - Defaults to port 9033
   - This is equivalent to `yarn start start -d default -p 9033`

- `yarn start miners:start`
    - Default thread count = 1  (1 mining thread on 1 physical CPU core) 
    - To control the number of CPU cores to dedicate to mining, use the --threads parameter
  
    - Examples:
       - `yarn start miners:start --threads 4`
           - To use 4 physical CPU cores
       - `yarn start miners:start --threads -1`
           - To use all the cores on your CPU
           - BUT beware, -1 is not recommended on hyperthreaded CPUs. Use physical core count.
    - Note: hyperthreading (2 miner threads per CPU Core) is not supported yet

You should see messages in the second terminal indicating that the miner is running:
 - "Starting to mine with 8 threads"
 - "Mining block 6261 on request 1264... \ 1105974 H/s" 
  
    - Where the H/s number corresponds to the hash rate power of your machine using the number of cores you allocated to minining threads. 
    - Performance reference: 8-core 3.8+ GHz AMD Ryzen 7 4700G gave the above 1.1 M H/s.
 - You will see a status line when a block is mined 
    - Mining 1 block can take several hours or even days depending on your machine's hashrate relative to the total network hashrate.
    - Even if you haven't mined any blocks, you are contributing to the robustness of the Testnet by running a node and miner(s).

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
