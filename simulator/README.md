# Simulator

The simulator runs a long-running simulation of a local Ironfish network. 
There is support for spawning nodes, miners, and various interactions between nodes.

## Adding a new simulation
Take a look at `simulations/demo.ts` for a detailed explanation to writing your own simulation. 
Feel free to also look at any of the other simulations to see what others have contributed.

Your simulation must implement the `Simulation` interface in `src/simulations/index.ts`. Once written,
import it into `src/simulations/index.ts` and add it to `SIMULATIONS`. Then, follow the instructions below to run it. 

## Usage
Run a simulation using `cd simulator; yarn start <simulation_name>`

There is currently no clean way to stop a simulation, sending `SIGINT` via `CTRL + C`
will result in a clean shutdown.

# Documentation
If desired, documentaiton can be generated via `yarn docs:generate; yarn docs:open`
