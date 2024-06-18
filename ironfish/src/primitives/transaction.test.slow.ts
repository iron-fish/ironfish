/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../testUtilities'
import { Transaction } from './transaction'

describe('Transaction', () => {
  const nodeTest = createNodeTest()

  it('produces unique transaction hashes', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const transactionA = await nodeTest.chain.createMinersFee(BigInt(0), 1, account.spendingKey)

    const transactionB = await nodeTest.chain.createMinersFee(BigInt(0), 1, account.spendingKey)

    const hashA = transactionA.unsignedHash()
    const hashB = transactionB.unsignedHash()

    expect(hashA.equals(hashB)).toBe(false)
  })

  it('check if a transaction is a miners fee', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const transactionA = await nodeTest.chain.createMinersFee(BigInt(0), 1, account.spendingKey)

    const transactionB = await nodeTest.chain.createMinersFee(
      BigInt(-1),
      1,
      account.spendingKey,
    )

    expect(transactionA.isMinersFee()).toBe(true)
    expect(transactionB.isMinersFee()).toBe(true)
  })

  it('check if a transaction is not a miners fee', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeTest.node.wallet, 'testA')
    const accountB = await useAccountFixture(nodeTest.node.wallet, 'testB')

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.wallet.scan()

    const raw = await nodeA.wallet.createTransaction({
      account: accountA,
      outputs: [
        {
          publicAddress: accountB.publicAddress,
          amount: BigInt(1),
          memo: Buffer.from(''),
          assetId: Asset.nativeId(),
        },
      ],
      fee: 1n,
      expiration: 0,
    })

    const { transaction } = await nodeA.wallet.post({
      transaction: raw,
      account: accountA,
    })

    expect(transaction.isMinersFee()).toBe(false)
  })

  it('deserializes a transaction', async () => {
    const { node, wallet, chain } = await nodeTest.createSetup()

    const account = await useAccountFixture(wallet)

    const fee = 5n
    const expiration = 10
    const amount = 10n
    const burnAmount = 1n
    const memo = Buffer.from('Hello World')
    const assetName = 'Testcoin'
    const metadata = 'testcoin metadata'
    const asset = new Asset(account.publicAddress, assetName, metadata)

    const block1 = await useMinerBlockFixture(chain, 2, account)
    await chain.addBlock(block1)

    const block2 = await useMintBlockFixture({
      node,
      account,
      asset,
      value: amount,
    })
    await chain.addBlock(block2)

    await wallet.scan()

    const originalTransaction = await usePostTxFixture({
      node,
      wallet,
      from: account,
      fee,
      expiration,
      outputs: [
        {
          publicAddress: account.publicAddress,
          amount,
          memo,
          assetId: Asset.nativeId(),
        },
      ],
      mints: [
        {
          creator: account.publicAddress,
          name: assetName,
          metadata,
          value: amount,
        },
      ],
      burns: [{ assetId: asset.id(), value: burnAmount }],
    })

    // Deserialize the transaction so we can verify deserialization is working properly
    const transaction = new Transaction(originalTransaction.serialize())

    expect(transaction.fee()).toEqual(fee)
    expect(transaction.expiration()).toEqual(expiration)

    // no spend is needed for burn: burn value subtracted from mint output value
    expect(transaction.spends.length).toEqual(1)
    expect(transaction.notes.length).toEqual(3)
    expect(transaction.mints.length).toEqual(1)
    expect(transaction.burns.length).toEqual(1)

    const mint = transaction.mints[0]
    expect(mint).toMatchObject({
      asset,
      value: amount,
      owner: Buffer.from(account.publicAddress, 'hex'),
      transferOwnershipTo: null,
    })

    const burn = transaction.burns[0]
    expect(burn).toMatchObject({
      assetId: asset.id(),
      value: burnAmount,
    })
  })

  it('Does not hold a posted transaction if no references are taken', async () => {
    const spendingKey = generateKey().spendingKey
    const tx = await nodeTest.chain.createMinersFee(0n, 0, spendingKey)
    const valid = await nodeTest.workerPool.verifyTransactions([tx])

    expect(valid).toMatchObject({ valid: true })
    expect(tx['transactionPosted']).toBeNull()
  })

  it('Holds a posted transaction if a reference is taken', async () => {
    const spendingKey = generateKey().spendingKey
    const tx = await nodeTest.chain.createMinersFee(0n, 0, spendingKey)

    await tx.withReference(async () => {
      expect(tx['transactionPosted']).not.toBeNull()
      expect(tx.notes.length).toEqual(1)
      expect(tx['transactionPosted']).not.toBeNull()

      // Reference returning happens on the promise jobs queue, so use an await
      // to delay until reference returning is expected to happen
      return Promise.resolve()
    })

    expect(tx['transactionPosted']).toBeNull()
  })

  it('Does not hold a note if no references are taken', async () => {
    const key = generateKey()
    const minersFee = await nodeTest.chain.createMinersFee(0n, 0, key.spendingKey)
    expect(minersFee['transactionPosted']).toBeNull()

    const note = minersFee.notes[0] ?? null
    expect(note).not.toBeNull()
    expect(note['noteEncrypted']).toBeNull()

    const decryptedNote = note.decryptNoteForOwner(key.incomingViewKey)
    Assert.isNotUndefined(decryptedNote, 'Note must be decryptable')
    expect(note['noteEncrypted']).toBeNull()
    expect(decryptedNote['note']).toBeNull()
    expect(decryptedNote.value()).toBe(2000000000n)
    expect(decryptedNote['note']).toBeNull()
  })
})
