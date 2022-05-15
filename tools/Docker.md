# Running Ironfish with Docker Compose

There are 2 docker-compose files:

 1. `docker-compose.yml` - Intended for users who wish to start a node, pool, and miner using Docker and newer versions of Docker Compose.
 2. `docker-compose.legacy.yml` - Intended for users who wish to start a node, pool, and miner using Docker and older versions of Docker Compose.
 3. `docker-compose.dev.yml` - Intended for developers who wish to run two (or more) nodes with a miner on a new network.

## Production config
### Docker Compose versions
`docker-compose.yml` was updated on docker-compose config **version 3.7**. Note: this version is more compatible with versions of Docker in Linux package repositories, which don't consistently support versions greater than 3.7. However, in many cases (such as Ubuntu 20.04 LTS) native OS repositories contain older version of docker-compose that are only compatible with configuration versions 2.4 or older. This is why Docker official documentation recommends installing Docker Engine and Docker Compose from their repositories instead of OS native repositories (https://docs.docker.com/engine/install/#server). 

Please check if your Linux distribution has latest version of docker-compose; if not -- install it using official Docker repositories. E.g for Ubuntu see https://docs.docker.com/engine/install/ubuntu/ or https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-compose-on-ubuntu-20-04).

In case you don't want to update and prefer to use the older Docker Compose, we also keep older 2.4 version of configuration file in `docker-compose.legacy.yml` -- you can rename it to `docker-compose.yml` and use.

### User config 
Users should change their node name and graffiti by editing the following line in the `docker-compose.yml` file:

    command: start --graffiti "graffitiExample" --name "nodeExample" --rpc.tcp --rpc.tcp.host=0.0.0.0 --rpc.tcp.port=8001 --port 9001

Users may change the memory limit for the miner in the `docker-compose.yml` file by editing the following line (8192MB is default):

    memory: 8192M

Or, if using the 2.4 docker-compose version:
    
    mem_limit: 8192M
  
### Pool config
Mining Pool support is native in Iron Fish since v0.1.26. 

Default `docker-compose.yml` configuration runs a standalone mining pool with no payouts (intended to use as your private pool with your own mining machines only).

Reminder: If your machines are located in different networks you have to forward 9034 port with firewall (e.g. UFW).

Please refer to https://github.com/iron-fish/ironfish/wiki/Getting-Started for more information on different options to run a mining pool.

### Base commands
Run the node, pool, and miner at the same time in detached mode: `docker-compose up -d`

Restart (recreate) the containers: `docker-compose up -d --force-recreate`

Follow the logs (cumulative): `docker-compose logs -f`

Follow node logs: `docker-compose logs -f node`

Follow pool logs: `docker-compose logs -f pool`

Follow miner logs: `docker-compose logs -f miner`

Follow the status : `docker-compose exec node ironfish status -f`

Create an account: `docker-compose exec node ironfish accounts:create`

Check your balance: `docker-compose exec node ironfish accounts:balance`

Create a transaction: `docker-compose exec node ironfish accounts:pay`

You can find more commands by running `docker-compose exec node ironfish help`.

### Choosing which components to run
If you don't want to run the pool, miner, or node itself, just comment out or remove the corresponding section from `docker-compose.yml`. This is useful if you have different machines for the node, pool, and miners.

Alternatively, you can specify service name (`node`, `pool`, or `miner`) in any `docker-compose ...` command to apply it to that service only. 

### Updating Iron Fish when using Docker
Iron Fish updates its Docker base image when new release comes out. You need to pull the new image and recreate the containers.

Check your current version: `docker-compose exec node ironfish status version`

Pull the new image: `docker pull ghcr.io/iron-fish/ironfish`

Update (recreate) the containers: `docker-compose up -d` (you can add `--force-recreate` flag too, but it should recreate the containers anyway if the image was updated).

Double-check the new version after updating. 

**Note**: that will not affect the node data directory, please read the Release Notes to check if you need to run `ironfish reset` or do any other changes on your local data. 

## Developer config

`docker-compose.dev.yml` is based on docker-compose config **version 3.7**. This version is more compatible with versions of Docker in Linux package repositories, which don't consistently support versions greater than 3.7.

This setup can be used with Docker Swarm, as well as Docker Compose by adding the `--compatibility` flag.

**Note**: this configuration is intended for developers who with to run a new network. Do not use this configuration for running a node in public testnet - it will not bootstrap from Ironfish network (due to `--bootstrap=''` flag).

### Base command:

`docker-compose -f docker-compose.dev.yml --compatibility up`
