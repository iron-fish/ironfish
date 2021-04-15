/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SerializedBlock, Target } from '../blockchain'
import { fakeMaxTarget } from '../captain/testUtilities'
import { IJSON } from '../serde'
import { genesisBlockData } from '../genesis/genesisBlock'
import { AsyncTransactionWorkerPool } from '../strategy/asyncTransactionWorkerPool'
import { generateKey } from 'ironfish-wasm-nodejs'
import { createNodeTest, useAccountFixture, useBlockFixture } from '../testUtilities'

describe('Accounts', () => {
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

  it('Returns the correct balance when an account receives a miners fee', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)
    await node.accounts.updateHead()

    // Initial balance should be 0
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    const result = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = strategy._blockSerde.deserialize(result)
    const addedBlock = await chain.addBlock(block)
    expect(addedBlock.isAdded).toBe(true)

    await node.accounts.updateHead()

    // Balance after adding the genesis block should be 0
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await nodeTest.strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + BigInt(1),
      account.spendingKey,
    )
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await node.accounts.updateHead()

    // Account should now have a balance of 500000000 after adding the miner's fee
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })
  }, 600000)

  it('Saves and restores transactions from accounts db', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)

    // Initial balance should be 0
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    const result = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = strategy._blockSerde.deserialize(result)
    const addedBlock = await chain.addBlock(block)
    expect(addedBlock.isAdded).toBe(true)

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + BigInt(1),
      account.spendingKey,
    )
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 500000000 after adding the miner's fee
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })

    await node.accounts.saveTransactionsToDb()

    node.accounts['noteToNullifier'].clear()
    node.accounts['nullifierToNote'].clear()
    node.accounts['transactionMap'].clear()

    // Account should now have a balance of 0 after clearing the cache
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    await node.accounts.loadTransactionsFromDb()

    // Balance should be back to 500000000
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })
  }, 600000)

  it('Lowers the balance after using pay to spend a note', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)

    // Initial balance should be 0
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    const result = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = strategy._blockSerde.deserialize(result)
    const addedBlock = await chain.addBlock(block)
    expect(addedBlock.isAdded).toBe(true)

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(
      BigInt(0),
      block.header.sequence + BigInt(1),
      account.spendingKey,
    )
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 500000000 after adding the miner's fee
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })

    // Spend the balance
    const transaction = await node.accounts.pay(
      node.memPool,
      account,
      BigInt(2),
      BigInt(0),
      '',
      generateKey().public_address,
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      await transaction.transactionFee(),
      block.header.sequence + BigInt(1),
      generateKey().spending_key,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 499999998
    await node.accounts.updateHead()
    expect(node.accounts.getBalance(account)).toEqual({
      confirmedBalance: BigInt(499999998),
      unconfirmedBalance: BigInt(499999998),
    })
  }, 600000)

  it('Counts notes correctly when a block has transactions not used by any account', async () => {
    const nodeA = nodeTest.node
    await nodeA.seed()

    // Create an account A
    const accountA = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testB'),
    )
    const accountC = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testC'),
    )

    // Create a block with a miner's fee
    const block1 = await useBlockFixture(nodeA.chain, async () =>
      nodeA.chain.newBlock(
        [],
        await nodeA.strategy.createMinersFee(BigInt(0), BigInt(2), accountA.spendingKey),
      ),
    )

    const addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    // Initial balance should be 500000000
    await nodeA.accounts.updateHead()
    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })

    const block2 = await useBlockFixture(nodeA.chain, async () => {
      // Generate a transaction from account A to account B
      const transaction = await nodeA.accounts.createTransaction(
        accountA,
        BigInt(1),
        BigInt(1),
        '',
        accountB.publicAddress,
      )

      // Create block 2
      return nodeA.chain.newBlock(
        [transaction],
        await nodeA.strategy.createMinersFee(
          await transaction.transactionFee(),
          BigInt(3),
          generateKey().spending_key,
        ),
      )
    })

    await nodeA.chain.addBlock(block2)
    await nodeA.accounts.updateHead()

    // Attempting to create another transaction for account A
    // to account C should not throw an error
    await expect(
      nodeA.accounts.createTransaction(
        accountA,
        BigInt(1),
        BigInt(1),
        '',
        accountC.publicAddress,
      ),
    ).resolves.toBeTruthy()
  }, 600000)

  it('Removes notes when rolling back a fork', async () => {
    // Create a block A1 that gives account A money
    // Create a block B1 and B2 that gives account B money
    // G -> A1
    //   -> B1 -> B2

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()
    await Promise.all([nodeA.seed(), nodeB.seed()])

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')

    await nodeA.accounts.importAccount(accountB)

    // Create and add A1
    const blockA1 = await useBlockFixture(nodeA.chain, async () =>
      nodeA.chain.newBlock(
        [],
        await nodeA.strategy.createMinersFee(BigInt(0), BigInt(2), accountA.spendingKey),
      ),
    )
    let addedBlock = await nodeA.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B1
    const blockB1 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(2), accountB.spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(2), accountB.spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()
    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(0),
    })
    expect(nodeB.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(1000000000),
      unconfirmedBalance: BigInt(1000000000),
    })

    // Copy block B1 to nodeA
    await nodeA.chain.addBlock(blockB1)
    await nodeA.accounts.updateHead()

    // Copy block B2 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.accounts.updateHead()
    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(500000000),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(1000000000),
      unconfirmedBalance: BigInt(1000000000),
    })
  }, 60000)

  it('Keeps spends created by the node when rolling back a fork', async () => {
    // Create a block 1 that gives account A money
    // Create a block A2 with a transaction from account A to account B
    // Create a block B2 that gives neither account money
    // G -> A1 -> A2
    //         -> B2 -> B3

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()
    await Promise.all([nodeA.seed(), nodeB.seed()])

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')
    await nodeA.accounts.importAccount(accountB)
    await nodeB.accounts.importAccount(accountA)

    // Create and add Block 1
    const block1 = await useBlockFixture(nodeB.chain, async () =>
      nodeA.chain.newBlock(
        [],
        await nodeA.strategy.createMinersFee(BigInt(0), BigInt(2), accountA.spendingKey),
      ),
    )
    let addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)
    addedBlock = await nodeB.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    await nodeA.accounts.updateHead()

    // Create and add A2
    const blockA2 = await useBlockFixture(
      nodeA.chain,
      async () => {
        // Generate a transaction from account A to account B
        const transaction = await nodeA.accounts.createTransaction(
          accountA,
          BigInt(2),
          BigInt(0),
          '',
          accountB.publicAddress,
        )

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(
            BigInt(0),
            BigInt(3),
            generateKey().spending_key,
          ),
        )
      },
      nodeA.accounts,
    )

    addedBlock = await nodeA.chain.addBlock(blockA2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(3), generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(4), generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()

    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(499999998),
      unconfirmedBalance: BigInt(499999998),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(2),
      unconfirmedBalance: BigInt(2),
    })
    expect(nodeB.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(500000000),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.accounts.updateHead()

    // B should not have confirmed coins yet because the transaction isn't on a block
    // A should not have confirmed coins any more because the transaction is pending
    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(499999998),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(2),
    })
  }, 600000)

  it('Undoes spends created by another node when rolling back a fork', async () => {
    // Create a block 1 that gives account A money
    // Create a block A2 with a transaction from account A to account B
    // Create a block B2 that gives neither account money
    // G -> A1 -> A2
    //         -> B2 -> B3

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()
    await Promise.all([nodeA.seed(), nodeB.seed()])

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')
    await nodeA.accounts.importAccount(accountB)
    await nodeB.accounts.importAccount(accountA)

    // Create and add Block 1
    const block1 = await useBlockFixture(
      nodeA.chain,
      async () =>
        nodeA.chain.newBlock(
          [],
          await nodeA.strategy.createMinersFee(BigInt(0), BigInt(2), accountA.spendingKey),
        ),
      nodeA.accounts,
    )

    let addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)
    addedBlock = await nodeB.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    // Generate a transaction from account A to account B
    await nodeB.accounts.updateHead()

    // Create and add A2
    const blockA2 = await useBlockFixture(
      nodeB.chain,
      async () => {
        // Generate a transaction from account A to account B
        const transaction = await nodeB.accounts.createTransaction(
          accountA,
          BigInt(2),
          BigInt(0),
          '',
          accountB.publicAddress,
        )

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(
            BigInt(0),
            BigInt(3),
            generateKey().spending_key,
          ),
        )
      },
      nodeB.accounts,
    )

    addedBlock = await nodeA.chain.addBlock(blockA2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(3), generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), BigInt(4), generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()

    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(499999998),
      unconfirmedBalance: BigInt(499999998),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(2),
      unconfirmedBalance: BigInt(2),
    })
    expect(nodeB.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(499999998),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.accounts.updateHead()

    // A should have its original coins
    // B should not have the coins any more
    expect(nodeA.accounts.getBalance(accountA)).toEqual({
      confirmedBalance: BigInt(500000000),
      unconfirmedBalance: BigInt(999999998),
    })
    expect(nodeA.accounts.getBalance(accountB)).toEqual({
      confirmedBalance: BigInt(0),
      unconfirmedBalance: BigInt(2),
    })
  }, 600000)
})
