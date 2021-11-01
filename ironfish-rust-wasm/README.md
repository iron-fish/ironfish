[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-wasm-web)](https://codecov.io/gh/iron-fish/ironfish)
[![codecov](https://codecov.io/gh/iron-fish/ironfish/branch/master/graph/badge.svg?token=PCSVEVEW5V&flag=ironfish-wasm-nodejs)](https://codecov.io/gh/iron-fish/ironfish)

## Accounts

This is a Rust wrapper for creating accounts and transactions to be converted into WASM.

### To Compile WASM

```
yarn build
```

This will generate `web` and `nodejs` folders that you can import in package.json files elsewhere in the repository with the following (choose either as appropriate):

```
  "dependencies": {
    "ironfish-wasm-web": "*",
    "ironfish-wasm-nodejs": "*"
  },
```
