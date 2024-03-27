/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { useAccountFixture, useTxSpendsFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getAccountTransaction', () => {
  const routeTest = createRouteTest(true)

  it('gets transaction by account', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'account')

    const { transaction } = await useTxSpendsFixture(node, { account })

    const response = await routeTest.client.wallet.getAccountTransaction({
      hash: transaction.hash().toString('hex'),
      account: account.name,
    })

    expect(response.status).toBe(200)

    const { transaction: responseTransaction, account: responseAccount } = response.content

    Assert.isNotNull(responseTransaction)

    expect(responseAccount).toMatch(account.name)

    expect(responseTransaction.spends).toEqual(
      transaction.spends.map((spend) => ({
        nullifier: spend.nullifier.toString('hex'),
        commitment: spend.commitment.toString('hex'),
        size: spend.size,
      })),
    )
    expect(responseTransaction.notes).toHaveLength(transaction.notes.length)

    // each note should include a hex representation of the memo in memoHex
    responseTransaction.notes?.map((note) => expect(note.memoHex).toBeDefined())
  })
})
