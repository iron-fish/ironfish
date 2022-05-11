# Running Ironfish with Docker Compose

There are 2 docker-compose files:

 1. `docker-compose.yml` - Intended for users who wish to start a node and miner using Docker.
 2. `docker-compose.dev.yml` - Intended for developers who wish to run two (or more) nodes with a miner on a new network.

## User config
`docker-compose.yml` was updated on docker-compose config **version 3.7** to align with the version used in the development docker-compose file. 

Users should change their node name and graffiti by editing the following line in the `docker-compose.yml` file:

    command: start --graffiti "graffitiExample" --name "nodeExample" --rpc.tcp --rpc.tcp.host=0.0.0.0 --rpc.tcp.port=8001 --port 9001

Users may change the memory limit for the miner in the `docker-compose.yml` file by editing the following line (8192MB is default):

    mem_limit=8192M
  
### Base commands
Run the node and miner at the same time in detached mode: `docker-compose up -d`

Follow the logs: `docker-compose logs -f`

Follow the status : `docker-compose exec node ironfish status -f`

Create an account: `docker-compose exec node ironfish accounts:create`

Check your balance: `docker-compose exec node ironfish accounts:balance`

Create a transaction: `docker-compose exec node ironfish accounts:pay`

You can find more commands by running `docker-compose exec node ironfish help`.

## Developer config

`docker-compose.dev.yml` is based on docker-compose config **version 3.7**. This version is less compatible with versions of Docker in Linux package repositories, which don't consistently support versions greater than 3.7.

This setup can be used with Docker Swarm, as well as Docker Compose by adding the `--compatibility` flag.

### Base command:

`docker-compose -f docker-compose.dev.yml --compatibility up`