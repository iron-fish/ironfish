/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { Target } from '../primitives/target'
import { ValidationError } from '../rpc/adapters/errors'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useMinerBlockFixture,
} from '../testUtilities'
import { acceptsAllTarget } from '../testUtilities/helpers/blockchain'

describe('Accounts', () => {
  const nodeTest = createNodeTest()
  let targetMeetsSpy: jest.SpyInstance
  let targetSpy: jest.SpyInstance

  beforeAll(() => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)

    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(acceptsAllTarget)
  })

  afterEach(async () => {
    await nodeTest.node.workerPool.stop()
  })

  afterAll(() => {
    targetMeetsSpy.mockClear()
    targetSpy.mockClear()
  })

  it('Returns the correct balance when an account receives a miners fee', async () => {
    // Initialize the database and chain
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)
    await node.accounts.updateHead()

    // Initial balance should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    await node.accounts.updateHead()

    // Balance after adding the genesis block should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await nodeTest.strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await node.accounts.updateHead()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
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
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    await node.accounts.saveTransactionsToDb()

    node.accounts['noteToNullifier'].clear()
    node.accounts['nullifierToNote'].clear()
    node.accounts['transactionMap'].clear()

    // Account should now have a balance of 0 after clearing the cache
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    await node.accounts.loadTransactionsFromDb()

    // Balance should be back to 2000000000
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
  }, 600000)

  it('Lowers the balance after using pay to spend a note', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)

    // Initial balance should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.accounts.pay(
      node.memPool,
      account,
      [
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: '',
        },
      ],
      BigInt(0),
      node.config.get('defaultTransactionExpirationSequenceDelta'),
      0,
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      await transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  }, 600000)

  it('Creates valid transactions when the worker pool is enabled', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain
    node.accounts['workerPool'].start()

    const account = await node.accounts.createAccount('test', true)

    // Initial balance should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.accounts.pay(
      node.memPool,
      account,
      [
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: '',
        },
      ],
      BigInt(0),
      node.config.get('defaultTransactionExpirationSequenceDelta'),
    )

    expect(transaction.expirationSequence()).toBe(
      node.chain.head.sequence + node.config.get('defaultTransactionExpirationSequenceDelta'),
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      await transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  }, 600000)

  it('creates valid transactions with multiple outputs', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain
    node.accounts['workerPool'].start()

    const account = await node.accounts.createAccount('test', true)

    // Initial balance should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    const transaction = await node.accounts.pay(
      node.memPool,
      account,
      [
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: 'recipient 1',
        },
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: 'recipient 2',
        },
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: 'recipient 3',
        },
      ],
      BigInt(0),
      node.config.get('defaultTransactionExpirationSequenceDelta'),
    )

    expect(transaction.expirationSequence()).toBe(
      node.chain.head.sequence + node.config.get('defaultTransactionExpirationSequenceDelta'),
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      await transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(1999999994),
      unconfirmed: BigInt(1999999994),
    })
  }, 600000)

  it('throws a ValidationError with an invalid expiration sequence', async () => {
    const node = nodeTest.node
    node.accounts['workerPool'].start()

    const account = await node.accounts.createAccount('test', true)

    // Spend the balance with an invalid expiration
    await expect(
      node.accounts.pay(
        node.memPool,
        account,
        [
          {
            publicAddress: generateKey().public_address,
            amount: BigInt(2),
            memo: '',
          },
        ],
        BigInt(0),
        node.config.get('defaultTransactionExpirationSequenceDelta'),
        1,
      ),
    ).rejects.toThrowError(ValidationError)
  }, 60000)

  it('Expires transactions when calling expireTransactions', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await node.accounts.createAccount('test', true)

    // Mock that accounts is started for the purposes of the test
    node.accounts['isStarted'] = true

    // Initial balance should be 0
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.accounts.updateHead()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance, setting expiry soon
    const transaction = await node.accounts.pay(
      node.memPool,
      account,
      [
        {
          publicAddress: generateKey().public_address,
          amount: BigInt(2),
          memo: '',
        },
      ],
      BigInt(0),
      1,
    )

    // Transaction should be unconfirmed
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(1999999998),
    })

    // Expiring transactions should not yet remove the transaction
    await node.accounts.expireTransactions()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(1999999998),
    })

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      await transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spending_key,
    )
    const newBlock2 = await chain.newBlock([], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Expiring transactions should now remove the transaction
    await node.accounts.updateHead()
    await node.accounts.expireTransactions()
    await expect(node.accounts.getBalance(account)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
  }, 600000)

  it('Counts notes correctly when a block has transactions not used by any account', async () => {
    const nodeA = nodeTest.node

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
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    const addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    // Initial balance should be 2000000000
    await nodeA.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    const block2 = await useBlockFixture(nodeA.chain, async () => {
      // Generate a transaction from account A to account B
      const transaction = await nodeA.accounts.createTransaction(
        accountA,
        [
          {
            publicAddress: accountB.publicAddress,
            amount: BigInt(1),
            memo: '',
          },
        ],
        BigInt(1),
        0,
      )

      // Create block 2
      return nodeA.chain.newBlock(
        [transaction],
        await nodeA.strategy.createMinersFee(
          await transaction.fee(),
          3,
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
        [
          {
            publicAddress: accountC.publicAddress,
            amount: BigInt(1),
            memo: '',
          },
        ],
        BigInt(1),
        0,
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

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')

    await nodeA.accounts.importAccount(accountB)

    // Create and add A1
    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    let addedBlock = await nodeA.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B1
    const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)
    addedBlock = await nodeB.chain.addBlock(blockB1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
    await expect(nodeB.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(4000000000),
      unconfirmed: BigInt(4000000000),
    })

    // Copy block B1 to nodeA
    await nodeA.chain.addBlock(blockB1)
    await nodeA.accounts.updateHead()

    // Copy block B2 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(2000000000),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(4000000000),
      unconfirmed: BigInt(4000000000),
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

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')
    await nodeA.accounts.importAccount(accountB)
    await nodeB.accounts.importAccount(accountA)

    // Create and add Block 1
    const block1 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
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
          [
            {
              publicAddress: accountB.publicAddress,
              amount: BigInt(2),
              memo: '',
            },
          ],
          BigInt(0),
          0,
        )

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(BigInt(0), 3, generateKey().spending_key),
        )
      },
      nodeA.accounts,
    )

    addedBlock = await nodeA.chain.addBlock(blockA2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useMinerBlockFixture(nodeB.chain, 3)
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useMinerBlockFixture(nodeB.chain, 4)
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()

    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(2),
      unconfirmed: BigInt(2),
    })
    await expect(nodeB.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.accounts.updateHead()

    // B should not have confirmed coins yet because the transaction isn't on a block
    // A should not have confirmed coins any more because the transaction is pending
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(1999999998),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(2),
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

    const accountA = await useAccountFixture(nodeA.accounts, 'testA')
    const accountB = await useAccountFixture(nodeB.accounts, 'testB')
    await nodeA.accounts.importAccount(accountB)
    await nodeB.accounts.importAccount(accountA)

    // Create and add Block A1
    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA, nodeA.accounts)
    let addedBlock = await nodeA.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Adding again should just say its added
    addedBlock = await nodeB.chain.addBlock(blockA1)
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
          [
            {
              publicAddress: accountB.publicAddress,
              amount: BigInt(2),
              memo: '',
            },
          ],
          BigInt(0),
          0,
        )

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(BigInt(0), 3, generateKey().spending_key),
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
        await nodeB.strategy.createMinersFee(BigInt(0), 3, generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), 4, generateKey().spending_key),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.accounts.updateHead()
    await nodeB.accounts.updateHead()

    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(2),
      unconfirmed: BigInt(2),
    })
    await expect(nodeB.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(1999999998),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.accounts.updateHead()

    // A should have its original coins
    // B should not have the coins any more
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toEqual({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(3999999998),
    })
    await expect(nodeA.accounts.getBalance(accountB)).resolves.toEqual({
      confirmed: BigInt(0),
      unconfirmed: BigInt(2),
    })
  }, 600000)
})
