# Running Ironfish with Docker Compose

There are 2 versions of docker-compose configuration:

 1. For the users to participate in incentivized testnet ->
    docker-compose.yml
 3. For the developers to run testing node/miner with RPC
      connection -> docker-compose.dev.yml

## User config
docker-compose.yml based on **version 2.4** of configuration, because it can be easier to run this on almost all machines and force more compatibility with CPU and RAM limitation to avoid out of memory error.

The users may change amount of allocated memory under miner service in .yml file (8192MB is default).

    mem_limit=8192M

Also the users should to change node name and graffiti under node service in command line (graffitiExample, nodeExample)

    command: ["start", "--graffiti", "graffitiExample", "--name", "nodeExample",]

  
### Base commands:
Run node and miner at the same time in detached mode: `docker-compose up -d`

Follow the logs: `docker-compose logs -f`

Follow the status : `docker-compose exec ironfish_node ./bin/run status -f`

Create an account: `docker-compose exec ironfish_node ./bin/run accounts:create`

Check balance: `docker-compose exec ironfish_node ./bin/run accounts:balance`

Make pay transaction: `docker-compose exec ironfish_node ./bin/run accounts:pay`

And many other commands which you can find in main documentation.

## Developer config

docker-compose.dev.yml based on **version 3.7** of configuration. This was made for more compatibility with Linux default Docker package, which was somewhat unusable with version >3.7.

This setup can be used with Docker Swarm and standard Docker Compose with addition of --compatibility flag

### Base command:

`docker-compose -f docker-compose.dev.yml --compatibility up`