/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SpiedFunction } from 'jest-mock'
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { BlockSerde, SerializedBlock } from '../primitives/block'
import { Target } from '../primitives/target'
import { IJSON } from '../serde'
import { createNodeTest, useAccountFixture } from '../testUtilities'
import { acceptsAllTarget } from '../testUtilities/helpers/blockchain'
import { addGenesisTransaction } from './addGenesisTransaction'
import { GenesisBlockInfo, makeGenesisBlock } from './makeGenesisBlock'

describe('Read genesis block', () => {
  const nodeTest = createNodeTest()

  let targetMeetsSpy: SpiedFunction<typeof Target.meets>
  let targetSpy: SpiedFunction<typeof Target.calculateTarget>

  beforeAll(() => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(acceptsAllTarget)
  })

  afterAll(() => {
    targetMeetsSpy.mockClear()
    targetSpy.mockClear()
  })

  it('Can start a chain with the existing genesis block', async () => {
    // We should also be able to create new blocks after the genesis block
    // has been added
    const minersfee = await nodeTest.chain.createMinersFee(
      BigInt(0),
      nodeTest.chain.head.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock = await nodeTest.chain.newBlock([], minersfee)
    expect(newBlock).toBeTruthy()
  }, 60000)
})

describe('Create genesis block', () => {
  const nodeTest = createNodeTest(false, { autoSeed: false })
  let targetMeetsSpy: SpiedFunction<typeof Target.meets>
  let targetSpy: SpiedFunction<typeof Target.calculateTarget>

  beforeAll(() => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(acceptsAllTarget)
  })

  afterAll(() => {
    targetMeetsSpy.mockClear()
    targetSpy.mockClear()
  })

  it('Can generate a valid genesis block', async () => {
    // Initialize the database and chain
    const node = nodeTest.node
    const chain = nodeTest.chain

    const amount = 5n

    // Construct parameters for the genesis block
    const account = await useAccountFixture(node.wallet, 'test')
    const info: GenesisBlockInfo = {
      timestamp: Date.now(),
      target: Target.maxTarget(),
      allocations: [
        {
          amountInOre: amount,
          publicAddress: account.publicAddress,
          memo: 'test',
        },
      ],
    }

    // Build the genesis block itself
    const { block } = await makeGenesisBlock(chain, info, node.logger)

    // Check some parameters on it to make sure they match what's expected.
    expect(block.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(block.header.target.asBigInt()).toEqual(Target.maxTarget().asBigInt())

    // Balance should still be zero, since generating the block should clear out
    // any notes made in the process
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Add the block to the chain
    const addBlock = await chain.addBlock(block)
    expect(addBlock.isAdded).toBeTruthy()

    await node.wallet.scan()

    // Check that the balance is what's expected
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: amount,
      unconfirmed: amount,
    })

    // Ensure we can construct blocks after that block
    const minersfee = await chain.createMinersFee(
      BigInt(0),
      block.header.sequence + 1,
      generateKey().spendingKey,
    )
    const additionalBlock = await chain.newBlock([], minersfee)
    expect(additionalBlock).toBeTruthy()

    // Next, serialize it in the same way that the genesis command serializes it
    const serialized = BlockSerde.serialize(block)
    const jsonedBlock = IJSON.stringify(serialized, '  ')

    // Now start from scratch with a clean database and make sure the block
    // is still the same.
    const { node: newNode, chain: newChain } = await nodeTest.createSetup()

    // Deserialize the block and add it to the new chain
    const result = IJSON.parse(jsonedBlock) as SerializedBlock
    const deserializedBlock = BlockSerde.deserialize(result, nodeTest.chain)
    const addedBlock = await newChain.addBlock(deserializedBlock)
    expect(addedBlock.isAdded).toBe(true)

    // Validate parameters again to make sure they're what's expected
    expect(deserializedBlock.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(deserializedBlock.header.target.asBigInt()).toEqual(Target.maxTarget().asBigInt())

    const accountNewNode = await newNode.wallet.importAccount(account)
    await newNode.wallet.scan()

    await expect(
      newNode.wallet.getBalance(accountNewNode, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: amount,
      unconfirmed: amount,
    })

    // Ensure we can construct blocks after that block
    const newMinersfee = await chain.createMinersFee(
      BigInt(0),
      deserializedBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock = await newChain.newBlock([], newMinersfee)
    expect(newBlock).toBeTruthy()
  })
})

describe('addGenesisTransaction', () => {
  const nodeTest = createNodeTest(false, { autoSeed: false })
  let targetMeetsSpy: SpiedFunction<typeof Target.meets>
  let targetSpy: SpiedFunction<typeof Target.calculateTarget>

  beforeAll(() => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(acceptsAllTarget)
  })

  afterAll(() => {
    targetMeetsSpy.mockClear()
    targetSpy.mockClear()
  })

  it('Can create a new genesis block with an added transaction', async () => {
    // Initialize the database and chain
    const originalNode = nodeTest.node
    const originalChain = nodeTest.chain

    // Construct parameters for the genesis block
    const account1Original = await useAccountFixture(originalNode.wallet, 'account1')
    const account2Original = await useAccountFixture(originalNode.wallet, 'account2')
    const account3Original = await useAccountFixture(originalNode.wallet, 'account3')

    const info: GenesisBlockInfo = {
      timestamp: Date.now(),
      target: Target.maxTarget(),
      allocations: [
        {
          amountInOre: 100n,
          publicAddress: account1Original.publicAddress,
          memo: 'account1',
        },
        {
          amountInOre: 100n,
          publicAddress: account2Original.publicAddress,
          memo: 'account2',
        },
      ],
    }

    // Build the original genesis block itself
    const { block: originalBlock } = await makeGenesisBlock(
      originalChain,
      info,
      originalNode.logger,
    )

    // Add the block to the chain
    const originalAddBlock = await originalChain.addBlock(originalBlock)
    expect(originalAddBlock.isAdded).toBeTruthy()

    const newAllocations = [
      {
        amountInOre: 50n,
        publicAddress: account1Original.publicAddress,
        memo: 'account1',
      },
      {
        amountInOre: 25n,
        publicAddress: account2Original.publicAddress,
        memo: 'account2',
      },
      {
        amountInOre: 25n,
        publicAddress: account3Original.publicAddress,
        memo: 'account3',
      },
    ]

    // Account 1: 100 in original allocation, but 50 used for the 2nd allocation
    const account1Amount = 50n
    // Account 2: 100 in the original allocation, and 25 in the 2nd allocation
    const account2Amount = 125n
    // Account 3: 25 in the 2nd allocation
    const account3Amount = 25n

    // Build the modified genesis block
    const { block } = await addGenesisTransaction(
      originalNode,
      account1Original,
      newAllocations,
      originalNode.logger,
    )

    // Compare the original parameters with the new one
    expect(originalBlock.header.sequence).toEqual(block.header.sequence)
    expect(originalBlock.header.previousBlockHash).toEqual(block.header.previousBlockHash)
    expect(originalBlock.header.target).toEqual(block.header.target)
    expect(originalBlock.header.randomness).toEqual(block.header.randomness)
    expect(originalBlock.header.timestamp).toEqual(block.header.timestamp)
    expect(originalBlock.header.graffiti).toEqual(block.header.graffiti)
    expect(originalBlock.header.noteCommitment).not.toEqual(block.header.noteCommitment)
    expect(originalBlock.header.noteSize).not.toEqual(block.header.noteSize)
    expect(originalBlock.header.transactionCommitment).not.toEqual(
      block.header.transactionCommitment,
    )
    expect(originalBlock.transactions.length).not.toEqual(block.transactions.length)

    // Balance should still be zero, since generating the block should clear out
    // any notes made in the process
    await expect(
      originalNode.wallet.getBalance(account1Original, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a new node
    const { chain, node } = await nodeTest.createSetup()

    // Import accounts
    const account1 = await node.wallet.importAccount(account1Original)
    const account2 = await node.wallet.importAccount(account2Original)
    const account3 = await node.wallet.importAccount(account3Original)

    // Next, serialize it in the same way that the genesis command serializes it
    const serialized = BlockSerde.serialize(block)
    const jsonedBlock = IJSON.stringify(serialized, '  ')

    // Deserialize the block and add it to the new chain
    const result = IJSON.parse(jsonedBlock) as SerializedBlock
    const deserializedBlock = BlockSerde.deserialize(result, nodeTest.chain)
    const addedBlock = await chain.addBlock(deserializedBlock)
    expect(addedBlock.isAdded).toBe(true)

    await node.wallet.scan()

    // Check that the balance is what's expected
    await expect(node.wallet.getBalance(account1, Asset.nativeId())).resolves.toMatchObject({
      confirmed: account1Amount,
      unconfirmed: account1Amount,
    })
    await expect(node.wallet.getBalance(account2, Asset.nativeId())).resolves.toMatchObject({
      confirmed: account2Amount,
      unconfirmed: account2Amount,
    })
    await expect(node.wallet.getBalance(account3, Asset.nativeId())).resolves.toMatchObject({
      confirmed: account3Amount,
      unconfirmed: account3Amount,
    })

    // Ensure we can construct blocks after that block
    const minersfee = await chain.createMinersFee(
      BigInt(0),
      block.header.sequence + 1,
      generateKey().spendingKey,
    )
    const additionalBlock = await chain.newBlock([], minersfee)
    expect(additionalBlock).toBeTruthy()

    // Validate parameters again to make sure they're what's expected
    expect(deserializedBlock.header.sequence).toEqual(block.header.sequence)
    expect(deserializedBlock.header.previousBlockHash).toEqual(block.header.previousBlockHash)
    expect(deserializedBlock.header.target).toEqual(block.header.target)
    expect(deserializedBlock.header.randomness).toEqual(block.header.randomness)
    expect(deserializedBlock.header.timestamp).toEqual(block.header.timestamp)
    expect(deserializedBlock.header.graffiti).toEqual(block.header.graffiti)
    expect(deserializedBlock.header.noteCommitment).toEqual(block.header.noteCommitment)
    expect(deserializedBlock.header.noteSize).toEqual(block.header.noteSize)
    expect(deserializedBlock.header.transactionCommitment).toEqual(
      block.header.transactionCommitment,
    )
    expect(deserializedBlock.transactions.length).toEqual(block.transactions.length)
  }, 600000)
})
