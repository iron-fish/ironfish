/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Transaction } from '../../../primitives'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AsyncUtils } from '../../../utils'

describe('Route wallet/sendTransaction (with note selection)', () => {
  const routeTest = createRouteTest()

  it('spends the specified notes', async () => {
    const sender = await useAccountFixture(routeTest.node.wallet, 'accountA')

    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const block = await useMinerBlockFixture(
      routeTest.chain,
      undefined,
      sender,
      routeTest.node.wallet,
    )
    await expect(routeTest.node.chain).toAddBlock(block)
    await routeTest.node.wallet.scan()

    const decryptedNotes = await AsyncUtils.materialize(sender.getNotes())
    const notes = decryptedNotes.map((note) => note.note.hash().toString('hex'))
    expect((await sender.getBalance(Asset.nativeId(), 0)).confirmed).toBe(2000000000n)

    const requestParams = {
      account: 'accountA',
      outputs: [
        {
          publicAddress: sender.publicAddress,
          amount: BigInt(10).toString(),
          memo: '',
          assetId: Asset.nativeId().toString('hex'),
        },
      ],
      fee: BigInt(1).toString(),
      notes,
    }

    const response = await routeTest.client.wallet.sendTransaction(requestParams)

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const transaction = new Transaction(Buffer.from(response.content.transaction, 'hex'))

    expect(transaction.notes.length).toBe(2)
    expect(transaction.expiration).toBeDefined()
    expect(transaction.burns.length).toBe(0)
    expect(transaction.mints.length).toBe(0)
    expect(transaction.spends.length).toBe(notes.length)
    expect(transaction.fee()).toBe(1n)

    const spendNullifiers = transaction.spends.map((spend) => spend.nullifier.toString('hex'))

    const spends = (
      await routeTest.client.wallet.getNotes({
        account: 'accountA',
      })
    ).content.notes.filter((note) => note.nullifier && spendNullifiers.includes(note.nullifier))
    const spendHashes = spends.map((spend) => spend.noteHash)

    expect(new Set(spendHashes)).toEqual(new Set(notes))
  })
})
