# ironfish-rosetta-api

[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-rosetta-api)](https://codecov.io/gh/iron-fish/ironfish)

API used for the Iron Fish Block Explorer.

The architecture is as follow

One instance:
Database <- Syncer -> Iron Fish node

Other instance
API -> Database


The block explorer client connects to the API. It allows scaling the API and the database, while still needing only one Iron Fish node and one Syncer.

## Installation
```sh
yarn
```

## Database
Depends on Postgres
```sh
brew install postgresql
brew services start postgresql

createdb rosetta;

psql
CREATE USER postgres;
grant all privileges on database rosetta to postgres;
ALTER SCHEMA public OWNER to postgres;
```

### Run migration
```sh
# Create a migration
yarn run migrate create my migration
# Run the migration
yarn run migrate up
# Rollback
yarn run migrate down
```

## Documentation
Run dev environment and access `http://localhost:8000/docs/`

## Development
```
brew services start postgresql
yarn dev
```

## Production
Starting the API:
```
yarn
yarn build
yarn start
```

Starting the Syncer:
```
yarn
yarn build
yarn start:syncer
```

Start an Iron Fish node with
```sh
ironfish start --rpc.tcp --rpc.tpc-port=8021
```

# Updating or creating a new API endpoint
The repository is using OpenAPI 3.0 from the Coinbase Rosetta specs. Find the latest version [here](https://github.com/coinbase/rosetta-specifications)

Copy the specs in the root
`cp -rf ../node_modules/rosetta-specifications ./rosetta-specifications`

Run `make gen` in `./rosetta-specifications`

Update the type file:
- run `yarn api:types`

# Testing the Rosetta integration
Install Rosetta CLI https://github.com/coinbase/rosetta-cli

Run:
- `rosetta-cli view:networks` to see the networks
...