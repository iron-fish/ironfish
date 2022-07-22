/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { SerializedBlock } from '../primitives/block'
import { Target } from '../primitives/target'
import { IJSON } from '../serde'
import { createNodeTest } from '../testUtilities'
import { acceptsAllTarget } from '../testUtilities/helpers/blockchain'
import { makeGenesisBlock } from './makeGenesisBlock'

describe('Read genesis block', () => {
  const nodeTest = createNodeTest()

  let targetMeetsSpy: jest.SpyInstance
  let targetSpy: jest.SpyInstance

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
    const minersfee = await nodeTest.strategy.createMinersFee(
      BigInt(0),
      nodeTest.chain.head.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock = await nodeTest.chain.newBlock([], minersfee)
    expect(newBlock).toBeTruthy()
  }, 60000)
})

describe('Create genesis block', () => {
  const nodeTest = createNodeTest(false, { autoSeed: false })
  let targetMeetsSpy: jest.SpyInstance
  let targetSpy: jest.SpyInstance

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
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const amountNumber = 5
    const amountBigint = BigInt(amountNumber)

    // Construct parameters for the genesis block
    const account = await node.accounts.createAccount('test', true)
    const info = {
      timestamp: Date.now(),
      memo: 'test',
      target: Target.maxTarget(),
      allocations: [
        {
          amount: amountNumber,
          publicAddress: account.publicAddress,
        },
      ],
    }

    // Build the genesis block itself
    const { block } = await makeGenesisBlock(chain, info, account, node.logger)

    // Check some parameters on it to make sure they match what's expected.
    expect(block.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(block.header.target.asBigInt()).toEqual(Target.maxTarget().asBigInt())

    // Balance should still be zero, since generating the block should clear out
    // any notes made in the process
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Add the block to the chain
    const addBlock = await chain.addBlock(block)
    expect(addBlock.isAdded).toBeTruthy()

    await node.accounts.updateHead()

    // Check that the balance is what's expected
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: amountBigint,
      unconfirmed: amountBigint,
    })

    // Ensure we can construct blocks after that block
    const minersfee = await strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + 1,
      generateKey().spending_key,
    )
    const additionalBlock = await chain.newBlock([], minersfee)
    expect(additionalBlock).toBeTruthy()

    // Next, serialize it in the same way that the genesis command serializes it
    const serialized = strategy.blockSerde.serialize(block)
    const jsonedBlock = IJSON.stringify(serialized, '  ')

    // Now start from scratch with a clean database and make sure the block
    // is still the same.
    const { node: newNode, chain: newChain } = await nodeTest.createSetup()

    // Deserialize the block and add it to the new chain
    const result = IJSON.parse(jsonedBlock) as SerializedBlock
    const deserializedBlock = strategy.blockSerde.deserialize(result)
    const addedBlock = await newChain.addBlock(deserializedBlock)
    expect(addedBlock.isAdded).toBe(true)

    // Validate parameters again to make sure they're what's expected
    expect(deserializedBlock.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(deserializedBlock.header.target.asBigInt()).toEqual(Target.maxTarget().asBigInt())

    await newNode.accounts.importAccount(account)
    await newNode.accounts.updateHead()
    await newNode.accounts.scanTransactions()

    await expect(newNode.accounts.getBalance(account)).resolves.toEqual({
      confirmed: amountBigint,
      unconfirmed: amountBigint,
    })

    // Ensure we can construct blocks after that block
    const newMinersfee = await strategy.createMinersFee(
      BigInt(0),
      deserializedBlock.header.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock = await newChain.newBlock([], newMinersfee)
    expect(newBlock).toBeTruthy()
  }, 600000)
})
