/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { MintData } from '../../../primitives/rawTransaction'
import { useAccountFixture } from '../../../testUtilities/fixtures/account'
import { useMinerBlockFixture } from '../../../testUtilities/fixtures/blocks'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getTransactionNotes', () => {
  const routeTest = createRouteTest()

  it('should return decrypted sent and received notes', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet)
    const recipient = await useAccountFixture(node.wallet, 'recipient')
    const asset = new Asset(account.publicAddress, 'test', '')

    const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(block)
    await node.wallet.scan()

    const burnValue = 2n
    const burn = {
      assetId: Asset.nativeId(),
      value: burnValue,
    }

    const mintValue = 1337n
    const mint: MintData = {
      creator: asset.creator().toString('hex'),
      name: asset.name().toString('utf8'),
      metadata: asset.metadata().toString('utf8'),
      value: mintValue,
    }

    const raw = await createRawTransaction({
      wallet: node.wallet,
      from: account,
      to: recipient,
      amount: 1n,
      fee: 0n,
      expiration: 10,
      burns: [burn],
      mints: [mint],
    })

    Assert.isNotNull(account.proofAuthorizingKey)
    const postedTx = raw.post(account.spendingKey)

    const response = await routeTest.client.wallet.getTransactionNotes({
      account: account.name,
      transaction: postedTx.serialize().toString('hex'),
    })

    const mintOutput = response.content.receivedNotes.filter(
      (n) => n.assetId === asset.id().toString('hex'),
    )
    expect(mintOutput).toHaveLength(1)
    expect(mintOutput[0].value).toEqual(mintValue.toString())

    const changeOutput = response.content.receivedNotes.filter(
      (n) => n.assetId === Asset.nativeId().toString('hex'),
    )
    expect(changeOutput).toHaveLength(1)
    expect(changeOutput[0].value).toBe('1999999997')
  })
})
