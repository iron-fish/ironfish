# ironfish-http-api

[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-http-api)](https://codecov.io/gh/iron-fish/ironfish)

API to support:

- faucet
- Iron Fish Node telemetry

The API uses a queuing system (graphile-worker) to get the different faucet requests. The queue is currently only executing one job at a time.

## Documentation

Run dev environment and access `http://localhost:8000/docs/`

## Installation
```sh
yarn
```

## Database
Depends on Postgres
```sh
brew install postgresql
brew services start postgresql

createdb faucet;

psql
CREATE USER postgres;
grant all privileges on database faucet to postgres;
ALTER SCHEMA public OWNER to faucet;
```

## Development
To start the api:
```sh
yarn
yarn dev
```

Start an Iron Fish node with
```sh
ironfish start --rpc.tcp --rpc.tpc-port=8021
```

To start processing the queue:
```sh
yarn start:worker
```

## Production

```sh
yarn
yarn build
yarn start
```

## Updating or creating a new API endpoint

The repository is using OpenAPI 3.0

When updating or adding a new endpoint:

- Edit the openapi.yml [online](https://editor.swagger.io/)
  or offline using Swagger editor
- Save the yml file in `config/openapi.yml`
- Export the file in JSON and save it on `config/openapi.json`
- run `yarn api:types`

## Collecting metrics with the influxdb endpoint

- Download influxdb and run './influxd'
- Visit [localhost:8086](http://localhost:8086) and follow the setup instructions
  - Suggested org name: ironfish
  - Suggested initial bucket: devnet
  - Hit configure later when you get to the welcome screen
    - We don't need telegraf
- Visit [Tokens](http://localhost:8086/orgs/3f00366dda9a52d3/load-data/tokens)
  - or Click Data, then Tokens
  - Copy your token to clipboard
- Copy the example.env file to .env and edit it with the appropriate values
- In three terminals run:
  - http-api: `yarn dev`
  - ironfish-cli: `yarn start start`
  - ironfish-cli: `yarn start miners:start`
- Visit Data Explorer in influxdb and explore the data
- As one example, paste this query into the Script Editor to show a simple graph:
  ```flux
  from(bucket: "devnet")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "minedBlock")
  |> filter(fn: (r) => r["_field"] == "difficulty")
  ```

