/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SerializedBlock, Target } from '../blockchain'
import { Captain } from '../captain'
import { makeDb, fakeMaxTarget } from '../captain/testUtilities'
import { IJSON } from '../serde'
import { genesisBlockData } from './genesisBlock'
import { makeGenesisBlock } from './makeGenesisBlock'
import { IronfishStrategy } from '../strategy'
import { WorkerPool } from '../workerPool'
import { AsyncTransactionWorkerPool } from '../strategy/asyncTransactionWorkerPool'
import { generateKey } from 'ironfish-wasm-nodejs'
import { createNodeTest } from '../testUtilities'

describe('Genesis block test', () => {
  const nodeTest = createNodeTest()
  let targetMeetsSpy: jest.SpyInstance
  let targetSpy: jest.SpyInstance

  beforeAll(() => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(() => fakeMaxTarget())
  })

  afterAll(async () => {
    await AsyncTransactionWorkerPool.stop()
    targetMeetsSpy.mockClear()
    targetSpy.mockClear()
  })

  it('Can start a chain with the existing genesis block', async () => {
    const db = makeDb()
    const workerPool = new WorkerPool()
    const strategy = new IronfishStrategy(workerPool)
    const captain = await Captain.new(db, strategy)
    await db.open()

    const result = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = strategy._blockSerde.deserialize(result)
    const addedBlock = await captain.chain.addBlock(block)
    expect(addedBlock.isAdded).toBe(true)

    // We should also be able to create new blocks after the genesis block
    // has been added
    const minersfee = await strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + BigInt(1),
      generateKey().spending_key,
    )
    const newBlock = await captain.chain.newBlock([], minersfee)
    expect(newBlock).toBeTruthy()
  }, 60000)

  it('Can generate a valid genesis block', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const captain = nodeTest.captain

    const amountNumber = 5
    const amountBigint = BigInt(amountNumber)

    // Construct parameters for the genesis block
    const account = await node.accounts.createAccount('test', true)
    const info = {
      timestamp: Date.now(),
      memo: 'test',
      allocations: [
        {
          amount: amountNumber,
          publicAddress: account.publicAddress,
        },
      ],
    }

    // Build the genesis block itself
    const { block } = await makeGenesisBlock(
      captain,
      info,
      account,
      node.workerPool,
      node.logger,
    )

    // Check some parameters on it to make sure they match what's expected.
    expect(block.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(block.header.target.asBigInt()).toEqual(Target.initialTarget().asBigInt())

    // Balance should still be zero, since generating the block should clear out
    // any notes made in the process
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    // Add the block to the chain
    const addBlock = await captain.chain.addBlock(block)
    expect(addBlock.isAdded).toBeTruthy()

    // TODO: this should happen automatically in addBlock
    await node.accounts.updateHead()

    // Check that the balance is what's expected
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: amountBigint,
      unconfirmedBalance: amountBigint,
    })

    // Ensure we can construct blocks after that block
    const minersfee = await strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + BigInt(1),
      generateKey().spending_key,
    )
    const additionalBlock = await captain.chain.newBlock([], minersfee)
    expect(additionalBlock).toBeTruthy()

    // Next, serialize it in the same way that the genesis command serializes it
    const serialized = strategy._blockSerde.serialize(block)
    const jsonedBlock = IJSON.stringify(serialized, '  ')

    // Now start from scratch with a clean database and make sure the block
    // is still the same.
    const { node: newNode, captain: newCaptain } = await nodeTest.createSetup()

    // Deserialize the block and add it to the new chain
    const result = IJSON.parse(jsonedBlock) as SerializedBlock<Buffer, Buffer>
    const deserializedBlock = strategy._blockSerde.deserialize(result)
    const addedBlock = await newCaptain.chain.addBlock(deserializedBlock)
    expect(addedBlock.isAdded).toBe(true)

    // Validate parameters again to make sure they're what's expected
    expect(deserializedBlock.header.timestamp.valueOf()).toEqual(info.timestamp)
    expect(deserializedBlock.header.target.asBigInt()).toEqual(
      Target.initialTarget().asBigInt(),
    )

    await newNode.accounts.importAccount(account)
    await newNode.accounts.updateHead()
    await newNode.accounts.scanTransactions()

    expect(newNode.accounts.getBalance(account)).toEqual({
      confirmedBalance: amountBigint,
      unconfirmedBalance: amountBigint,
    })

    // Ensure we can construct blocks after that block
    const newMinersfee = await strategy.createMinersFee(
      BigInt(0),
      deserializedBlock.header.sequence + BigInt(1),
      generateKey().spending_key,
    )
    const newBlock = await newCaptain.chain.newBlock([], newMinersfee)
    expect(newBlock).toBeTruthy()
  }, 600000)
})
