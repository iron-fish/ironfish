// Fixes an issue with jest+node where the ArrayBuffer instance within a vm context doesn't pass
// an instanceof check against an ArrayBuffer in the global scope.
// Taken from https://github.com/facebook/jest/issues/7780#issuecomment-615890410
"use strict";

const NodeEnvironment = require("jest-environment-node");

class CustomNodeEnvironment extends NodeEnvironment {
  constructor(config) {
    super(
      Object.assign({}, config, {
        globals: Object.assign({}, config.globals, {
          Uint32Array: Uint32Array,
          Uint8Array: Uint8Array,
          ArrayBuffer: ArrayBuffer,
          AbortController: AbortController,
        }),
      }),
    );
  }

  async setup() {}

  async teardown() {}

}

module.exports = CustomNodeEnvironment;