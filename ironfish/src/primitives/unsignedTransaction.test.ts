/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import fs from 'fs'
import { Assert } from '../assert'
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BufferUtils, CurrencyUtils } from '../utils'
import { Note } from './note'
import { MintData } from './rawTransaction'
import { UnsignedTransaction } from './unsignedTransaction'

describe('UnsignedTransaction', () => {
  const nodeTest = createNodeTest()

  it('should return descriptions', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const recipient = await useAccountFixture(nodeTest.wallet, 'recipient')
    const asset = new Asset(account.publicAddress, 'mint only', '')

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.updateHead()

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
      value: 1n,
    }

    // const outputz: {
    //   publicAddress: string
    //   amount: bigint
    //   memo: Buffer
    //   assetId: Buffer
    // }[] = []
    // for (let i = 0; i < 600; i++) {
    //   outputz.push({
    //     publicAddress: recipient.publicAddress,
    //     amount: 1n,
    //     memo: Buffer.alloc(32),
    //     assetId: Asset.nativeId(),
    //   })
    // }
    // console.log(buffer.byteLength)
    const output = {
      publicAddress: recipient.publicAddress,
      amount: 1n,
      memo: Buffer.alloc(0),
      assetId: Asset.nativeId(),
    }
    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      fee: 0n,
      expiration: 10,
      outputs: [],
      burns: [],
      mints: [mint],
    })

    Assert.isNotNull(account.proofAuthorizingKey)
    const builtTx = raw.build(
      account.proofAuthorizingKey,
      account.viewKey,
      account.outgoingViewKey,
    )
    const unsigned = new UnsignedTransaction(builtTx.serialize())
    const outputs: string[] = []
    const feeText = `Fee: ${CurrencyUtils.renderIron(raw.fee)}`
    outputs.push(feeText)
    outputs.push(`Funds sent:`)

    const outputsExpert: string[] = []
    outputsExpert.push(feeText)
    outputsExpert.push(`Outputs:`)

    let count = 1
    let max = raw.outputs.length
    for (const note of unsigned.notes) {
      const tempOut: string[] = []
      const sentNote = note.decryptNoteForOwner(recipient.incomingViewKey)
      if (sentNote) {
        const prefix = `[${count}/${max}] |`
        const assetId = sentNote.assetId()
        const assetName = (await nodeTest.chain.getAssetById(assetId))?.name
        Assert.isNotUndefined(assetName)
        tempOut.push(`${prefix} Amount: ${CurrencyUtils.renderIron(sentNote.value())}`)
        tempOut.push(`${prefix} To: ${sentNote.owner()}`)
        tempOut.push(`${prefix} From: ${sentNote.sender()}`)
        tempOut.push(`${prefix} Memo: ${BufferUtils.toHuman(sentNote.memo())}`)
        outputs.push(...tempOut)
        tempOut.push(`${prefix} Asset ID: ${assetId.toString('hex')}`)
        tempOut.push(`${prefix} Asset Name: ${BufferUtils.toHuman(assetName)}`)
        outputsExpert.push(...tempOut)
      }
      count++
    }

    count = 1
    max = raw.spends.length
    outputsExpert.push(`Spends:`)
    for (const spend of unsigned.spends) {
      const tempOut: string[] = []
      const prefix = `[${count}/${max}] |`
      tempOut.push(`${prefix} Nullifier: ${spend.nullifier.toString('hex')}`)
      tempOut.push(`${prefix} Commitment: ${spend.commitment.toString('hex')}`)
      tempOut.push(`${prefix} Size: ${spend.size}`)
      outputsExpert.push(...tempOut)
      count++
    }

    count = 1
    max = raw.mints.length
    if (raw.mints.length > 0) {
      outputs.push(`Mints:`)
      outputsExpert.push(`Mints:`)
      for (const mint of unsigned.mints) {
        const tempOut: string[] = []
        const prefix = `[${count}/${max}] |`
        tempOut.push(`${prefix} Asset ID: ${mint.asset.id().toString('hex')}`)
        tempOut.push(`${prefix} Asset Name: ${BufferUtils.toHuman(mint.asset.name())}`)
        tempOut.push(`${prefix} Value: ${CurrencyUtils.renderIron(mint.value)}`)
        if (mint.transferOwnershipTo) {
          tempOut.push(
            `${prefix} Transfer Ownership To: ${mint.transferOwnershipTo.toString('hex')}`,
          )
        }
        outputs.push(...tempOut)
        outputsExpert.push(...tempOut)
        count++
      }
    }

    count = 1
    max = raw.burns.length
    if (raw.burns.length > 0) {
      outputs.push(`Burns:`)
      outputsExpert.push(`Burns:`)
      for (const burn of unsigned.burns) {
        const tempOut: string[] = []
        const prefix = `[${count}/${max}] |`
        const asset = await nodeTest.chain.getAssetById(burn.assetId)
        Assert.isNotNull(asset)
        tempOut.push(`${prefix} Asset ID: ${burn.assetId.toString('hex')}`)
        tempOut.push(`${prefix} Asset Name: ${BufferUtils.toHuman(asset.name)}`)
        tempOut.push(`${prefix} Value: ${CurrencyUtils.renderIron(burn.value)}`)
        outputs.push(...tempOut)
        outputsExpert.push(...tempOut)
        count++
      }
    }

    const tx = {
      index: 1,
      name: '1 ore',
      blob: unsigned.serialize().toString('hex'),
      output: outputs,
      output_expert: outputsExpert,
    }

    // ...
    console.log(JSON.stringify(tx, null, 2))
    // fs.writeFile('output.json', JSON.stringify(tx, null, 2), (err) => {
    //   if (err) {
    //     console.error('Error writing file', err)
    //   } else {
    //     console.log('Successfully wrote to output.json')
    //   }
    // })
    expect(1).toBe(0)

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
