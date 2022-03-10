/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const consola = require('consola')
const { generateKey } = require('@ironfish/rust-nodejs')

jest.mock('node-datachannel', () => {
  return {
    PeerConnection: class {
      onLocalDescription() {}
      onLocalCandidate() {}
      onDataChannel() {}
      createDataChannel() {
        return {
          onOpen: () => {},
          onError: () => {},
          onClosed: () => {},
          onMessage: () => {},
          close: () => {},
          isOpen: () => {},
          sendMessage: () => {},
        }
      }
    },
  }
})

beforeAll(() => {
  // This causes Sapling to be initialized, which is 1 time 2 second cost for each test suite
  if (process.env.TEST_INIT_RUST) {
    generateKey()
  }
})

beforeEach(() => {
  consola.pause()
})
