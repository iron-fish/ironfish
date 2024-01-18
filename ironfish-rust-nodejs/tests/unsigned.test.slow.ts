/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, Transaction, generateKey } from ".."

describe('UnsignedTransaction', () => {
    describe('ser/de', () => {
        it('can post a valid transaction', () => {
        const key = generateKey()
        const asset = new Asset(key.publicAddress, 'testcoin', '')
        const proposedTx = new Transaction(1)
        proposedTx.mint(asset, 5n)
        proposedTx.build()
        expect(() => { ).not.toThrow()

        })
    })
})
  