/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Note } from './note'
import { MintData } from './rawTransaction'
import { UnsignedTransaction } from './unsignedTransaction'

describe('UnsignedTransaction', () => {
  const nodeTest = createNodeTest()

  it('should return descriptions', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const recipient = await useAccountFixture(nodeTest.wallet, 'recipient')
    const asset = new Asset(account.publicAddress, 'test', '')

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

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
      wallet: nodeTest.wallet,
      from: account,
      to: recipient,
      amount: 1n,
      fee: 0n,
      expiration: 10,
      burns: [burn],
      mints: [mint],
    })

    Assert.isNotNull(account.proofAuthorizingKey)
    const builtTx = raw.build(
      account.proofAuthorizingKey,
      account.viewKey,
      account.outgoingViewKey,
    )
    const unsigned = new UnsignedTransaction(builtTx.serialize())

    const receivedNotes: Note[] = []
    for (const note of unsigned.notes) {
      const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
      if (receivedNote) {
        receivedNotes.push(receivedNote)
      }
    }

    const mintOutput = receivedNotes.filter((n) => n.assetId().equals(asset.id()))
    expect(mintOutput).toHaveLength(1)
    expect(mintOutput[0].value()).toEqual(mintValue)

    expect(unsigned.mints).toEqual([
      {
        asset,
        value: mintValue,
        owner: Buffer.from(account.publicAddress, 'hex'),
        transferOwnershipTo: null,
      },
    ])
    expect(unsigned.burns).toEqual([
      {
        assetId: Asset.nativeId(),
        value: burnValue,
      },
    ])
  })
})
