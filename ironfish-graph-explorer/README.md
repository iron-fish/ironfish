# Graph Explorer

This project is used to visually explore the blockchain for debugging purposes. It's not the block explorer (https://explorer.ironfish.network), which is located at https://github.com/iron-fish/block-explorer

![Screenshot](./screenshot.png)

### How to Use

Right now, data is pulled manually from src/data.json which is exported by `ironfish chain:export`. Down the line, we want to serve this live from the node itself, or a data source such as an API that can serve the data real time.

 1. `(cd ironfish-cli; yarn start:once chain:export --path="../ironfish-graph-explorer/src/data.json")`
 1. `(cd ironfish-graph-explorer; yarn start)`
 1. `open http://localhost:9000`

```bash
cd ironfish-cli
yarn start:once chain:export

cd ironfish-graph-explorer
yarn start

open http://localhost:9000
```

Note: you may need to run `yarn install` in ./ironfish-graph-explorer to install all required packages.
