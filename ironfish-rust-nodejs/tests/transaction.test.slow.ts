/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, Transaction, generateKey } from ".."

describe('Transaction', () => {
  describe('post', () => {
    it('throws an error when posting an invalid transaction version', () => {
      const key = generateKey()
      const asset = new Asset(key.publicAddress, 'testcoin', '')
      // Version 1 transactions cannot have an ownership transfer
      const proposedTx = new Transaction(1)
      proposedTx.mint(asset, 5n, key.publicAddress)

      expect(() => { proposedTx.post(key.spendingKey, null, 0n)}).toThrow('InvalidTransactionVersion')
    })

    it('can post a valid transaction', () => {
      const key = generateKey()
      const asset = new Asset(key.publicAddress, 'testcoin', '')
      const proposedTx = new Transaction(1)
      proposedTx.mint(asset, 5n)

      expect(() => { proposedTx.post(key.spendingKey, null, 0n)}).not.toThrow()

    })
  })
})
