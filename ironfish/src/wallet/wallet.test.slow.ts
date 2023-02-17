/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { Target } from '../primitives/target'
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

  beforeAll(async () => {
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    targetSpy = jest.spyOn(Target, 'calculateTarget').mockImplementation(acceptsAllTarget)

    await nodeTest.setup()
    nodeTest.workerPool.start()
  })

  afterAll(async () => {
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

    const account = await useAccountFixture(node.wallet, 'test', true)
    await node.wallet.updateHead()

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    await node.wallet.updateHead()

    // Balance after adding the genesis block should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await nodeTest.strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await node.wallet.updateHead()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
  })

  it('Lowers the balance after using send to spend a note', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test', true)

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      node.config.get('transactionExpirationDelta'),
      0,
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  })

  it('Creates valid transactions when the worker pool is enabled', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test', true)

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      node.config.get('transactionExpirationDelta'),
    )

    expect(transaction.expiration()).toBe(
      node.chain.head.sequence + node.config.get('transactionExpirationDelta'),
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  })

  it('creates valid transactions with multiple outputs', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test', true)

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: 'recipient 1',
          assetId: Asset.nativeId(),
        },
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: 'recipient 2',
          assetId: Asset.nativeId(),
        },
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: 'recipient 3',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      node.config.get('transactionExpirationDelta'),
    )

    expect(transaction.expiration()).toBe(
      node.chain.head.sequence + node.config.get('transactionExpirationDelta'),
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 6 should be 1999999994
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999994),
      unconfirmed: BigInt(1999999994),
    })
  })

  it('throws a ValidationError with an invalid expiration sequence', async () => {
    const node = nodeTest.node
    const account = await useAccountFixture(node.wallet, 'test', true)

    // Spend the balance with an invalid expiration
    await expect(
      node.wallet.send(
        account,
        [
          {
            publicAddress: generateKey().publicAddress,
            amount: BigInt(2),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        BigInt(0),
        node.config.get('transactionExpirationDelta'),
        1,
      ),
    ).rejects.toThrow(Error)
  })

  it('Expires transactions when calling expireTransactions', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test', true)

    // Mock that accounts is started for the purposes of the test
    node.wallet['isStarted'] = true

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance, setting expiry soon
    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      1,
    )

    // Transaction should be pending
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Expiring transactions should not yet remove the transaction
    await node.wallet.expireTransactions()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Expiring transactions should now remove the transaction
    await node.wallet.updateHead()
    await node.wallet.expireTransactions()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
  })

  it('Expires transactions when calling expireTransactions with restarts', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    // // Mock that accounts is started for the purposes of the test
    node.wallet['isStarted'] = true

    const account = await useAccountFixture(node.wallet, 'test', true)

    // Create a second account
    await node.wallet.createAccount('test2')

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    await expect(chain).toAddBlock(newBlock)

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance, setting expiry soon
    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      1,
    )

    // Transaction should be unconfirmed
    await expect(account.hasPendingTransaction(transaction.hash())).resolves.toBeTruthy()

    // Expiring transactions should not yet remove the transaction
    await node.wallet.expireTransactions()
    await expect(account.hasPendingTransaction(transaction.hash())).resolves.toBeTruthy()

    await node.wallet.close()
    await node.wallet.open()

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Expiring transactions should now remove the transaction
    await node.wallet.updateHead()
    await node.wallet.expireTransactions()
    await expect(account.hasPendingTransaction(transaction.hash())).resolves.toBeFalsy()
  }, 600000)

  it('Counts notes correctly when a block has transactions not used by any account', async () => {
    const nodeA = nodeTest.node

    // Create accounts
    const accountA = await useAccountFixture(nodeA.wallet, 'testA')
    const accountB = await useAccountFixture(nodeA.wallet, 'testB')
    const accountC = await useAccountFixture(nodeA.wallet, 'testC')

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    const addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    // Initial balance should be 2000000000
    await nodeA.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    const block2 = await useBlockFixture(nodeA.chain, async () => {
      // Generate a transaction from account A to account B
      const raw = await nodeA.wallet.createTransaction({
        account: accountA,
        outputs: [
          {
            publicAddress: accountB.publicAddress,
            amount: BigInt(1),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        fee: 1n,
        expiration: 0,
      })

      const transaction = await nodeA.wallet.post({
        transaction: raw,
        account: accountA,
      })

      // Create block 2
      return nodeA.chain.newBlock(
        [transaction],
        await nodeA.strategy.createMinersFee(transaction.fee(), 3, generateKey().spendingKey),
      )
    })

    await nodeA.chain.addBlock(block2)
    await nodeA.wallet.updateHead()

    // Attempting to create another transaction for account A
    // to account C should not throw an error
    await expect(
      nodeA.wallet.createTransaction({
        account: accountA,
        outputs: [
          {
            publicAddress: accountC.publicAddress,
            amount: BigInt(1),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        fee: 1n,
        expiration: 0,
      }),
    ).resolves.toBeTruthy()
  })

  it('Removes notes when rolling back a fork', async () => {
    // Create a block A1 that gives account A money
    // Create a block B1 and B2 that gives account B money
    // G -> A1
    //   -> B1 -> B2

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'testA')
    const accountB = await useAccountFixture(nodeB.wallet, 'testB')

    const accountBNodeA = await nodeA.wallet.importAccount(accountB)

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
    await nodeA.wallet.updateHead()
    await nodeB.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
    await expect(nodeB.wallet.getBalance(accountB, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(4000000000),
      unconfirmed: BigInt(4000000000),
    })

    // Copy block B1 to nodeA
    await nodeA.chain.addBlock(blockB1)
    await nodeA.wallet.updateHead()

    // Copy block B2 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(4000000000),
      unconfirmed: BigInt(4000000000),
    })
  })

  it('View only accounts can observe received and spent notes', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test')
    const accountValue = {
      id: 'abc123',
      name: 'viewonly',
      version: 1,
      spendingKey: null,
      publicAddress: account.publicAddress,
      viewKey: account.viewKey,
      outgoingViewKey: account.outgoingViewKey,
      incomingViewKey: account.incomingViewKey,
    }
    const viewOnlyAccount = await node.wallet.importAccount(accountValue)

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(
      node.wallet.getBalance(viewOnlyAccount, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.wallet.send(
      account,
      [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      BigInt(0),
      node.config.get('transactionExpirationDelta'),
      0,
    )

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(
      node.wallet.getBalance(viewOnlyAccount, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  })

  it('Keeps spends created by the node when rolling back a fork', async () => {
    // Create a block 1 that gives account A money
    // Create a block A2 with a transaction from account A to account B
    // Create a block B2 that gives neither account money
    // G -> A1 -> A2
    //         -> B2 -> B3

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'testA')
    const accountB = await useAccountFixture(nodeB.wallet, 'testB')
    const accountBNodeA = await nodeA.wallet.importAccount(accountB)
    const accountANodeB = await nodeB.wallet.importAccount(accountA)

    // Create and add Block 1
    const block1 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
    let addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)
    addedBlock = await nodeB.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    await nodeA.wallet.updateHead()

    // Create and add A2
    const blockA2 = await useBlockFixture(
      nodeA.chain,
      async () => {
        // Generate a transaction from account A to account B
        const raw = await nodeA.wallet.createTransaction({
          account: accountA,
          outputs: [
            {
              publicAddress: accountB.publicAddress,
              amount: BigInt(2),
              memo: '',
              assetId: Asset.nativeId(),
            },
          ],
          fee: 0n,
          expiration: 0,
        })

        const transaction = await nodeA.wallet.post({
          transaction: raw,
          account: accountA,
        })

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
        )
      },
      nodeA.wallet,
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
    await nodeA.wallet.updateHead()
    await nodeB.wallet.updateHead()

    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2),
      unconfirmed: BigInt(2),
    })
    await expect(
      nodeB.wallet.getBalance(accountANodeB, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.wallet.updateHead()

    // B should not have confirmed coins yet because the transaction isn't on a block
    // A should still have confirmed coins because the transaction isn't on a block
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
  })

  it('Keeps spends created by another node when rolling back a fork', async () => {
    // Create a block 1 that gives account A money
    // Create a block A2 with a transaction from account A to account B
    // Create a block B2 that gives neither account money
    // G -> A1 -> A2
    //         -> B2 -> B3

    const nodeA = nodeTest.node
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'testA')
    const accountB = await useAccountFixture(nodeB.wallet, 'testB')
    const accountBNodeA = await nodeA.wallet.importAccount(accountB)
    const accountANodeB = await nodeB.wallet.importAccount(accountA)

    // Create and add Block A1
    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA, nodeA.wallet)
    let addedBlock = await nodeA.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Adding again should just say its added
    addedBlock = await nodeB.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Generate a transaction from account A to account B
    await nodeB.wallet.updateHead()

    // Create and add A2
    const blockA2 = await useBlockFixture(
      nodeB.chain,
      async () => {
        // Generate a transaction from account A to account B
        const raw = await nodeB.wallet.createTransaction({
          account: accountANodeB,
          outputs: [
            {
              publicAddress: accountB.publicAddress,
              amount: BigInt(2),
              memo: '',
              assetId: Asset.nativeId(),
            },
          ],
          fee: 0n,
          expiration: 0,
        })

        const transaction = await nodeB.wallet.post({
          transaction: raw,
          account: accountANodeB,
        })

        // Create block A2
        return nodeA.chain.newBlock(
          [transaction],
          await nodeA.strategy.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
        )
      },
      nodeB.wallet,
    )

    addedBlock = await nodeA.chain.addBlock(blockA2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.strategy.createMinersFee(BigInt(0), 4, generateKey().spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.wallet.updateHead()
    await nodeB.wallet.updateHead()

    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2),
      unconfirmed: BigInt(2),
    })
    await expect(
      nodeB.wallet.getBalance(accountANodeB, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Copy block B2 and B3 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.chain.addBlock(blockB3)
    await nodeA.wallet.updateHead()

    // B should not have confirmed coins yet because the transaction isn't on a block
    // A should still have confirmed coins because the transaction isn't on a block
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(
      nodeA.wallet.getBalance(accountBNodeA, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
  })
})
