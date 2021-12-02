[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-cli)](https://codecov.io/gh/iron-fish/ironfish)

The main entry point for an Iron Fish CLI that is capable of mining blocks and spending notes. It's created using the [oclif CLI framework](https://oclif.io)

## Starting the CLI

Build, run, and restart when the code changes:

- `yarn start`

Build, then run the CLI without watching for changes:

- `yarn start:once`

## Use Scenarios

### Starting a single node
Run these command in the terminal:

- `yarn start start`

Interact with the node in a new tab:
- `yarn start accounts:balance`
- `yarn start faucet:giveme`
- `yarn start accounts:pay`

### Mining
Then run these commands in two different terminals:

- `yarn start start -d default -p 9033`
- `yarn start miners:start`

You should see messages in the second terminal indicating that blocks are mined.

### Mining with Multiple Threads
After starting your node, run this command in a separate terminal.

- `yarn start miners:start -t <num_threads>`

Enter -1 as your num_threads to run the maximum possible number on your system.

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
