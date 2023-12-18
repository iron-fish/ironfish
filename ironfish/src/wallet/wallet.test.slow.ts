/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  ASSET_ID_LENGTH,
  frostRoundOne,
  frostRoundTwo,
  generateKey,
  RoundOneSigningData,
  SigningCommitment,
  splitSecret,
  verifyTransactions,
} from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../testUtilities'
import { acceptsAllTarget } from '../testUtilities/helpers/blockchain'

describe('Wallet', () => {
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

    const account = await useAccountFixture(node.wallet, 'test')
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

    const account = await useAccountFixture(node.wallet, 'test')

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
    const transaction = await node.wallet.send({
      account,
      outputs: [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
      expiration: 0,
    })

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

    const account = await useAccountFixture(node.wallet, 'test')

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
    const transaction = await node.wallet.send({
      account,
      outputs: [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
    })

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

    const account = await useAccountFixture(node.wallet, 'test')

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

    const transaction = await node.wallet.send({
      account,
      outputs: [
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
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
    })

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
    const account = await useAccountFixture(node.wallet, 'test')

    // Spend the balance with an invalid expiration
    await expect(
      node.wallet.send({
        account,
        outputs: [
          {
            publicAddress: generateKey().publicAddress,
            amount: BigInt(2),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        fee: BigInt(0),
        expirationDelta: node.config.get('transactionExpirationDelta'),
        expiration: 1,
      }),
    ).rejects.toThrow(Error)
  })

  it('Expires transactions when calling expireTransactions', async () => {
    // Initialize the database and chain
    const strategy = nodeTest.strategy
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test')

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
    const transaction = await node.wallet.send({
      account,
      outputs: [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: 1,
    })

    // Transaction should be pending
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Expiring transactions should not yet remove the transaction
    await node.wallet.expireTransactions(node.chain.head.sequence)
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
    await node.wallet.expireTransactions(newBlock2.header.sequence)
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

    const account = await useAccountFixture(node.wallet, 'test')

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
    const transaction = await node.wallet.send({
      account,
      outputs: [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: 1,
    })

    // Transaction should be unconfirmed
    await expect(account.hasPendingTransaction(transaction.hash())).resolves.toBeTruthy()

    // Expiring transactions should not yet remove the transaction
    await node.wallet.expireTransactions(node.chain.head.sequence)
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
    await node.wallet.expireTransactions(newBlock2.header.sequence)
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

      const { transaction } = await nodeA.wallet.post({
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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { setCreatedAt: false })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { setCreatedAt: false })

    const accountBNodeA = await nodeA.wallet.importAccount(accountB)

    // Create and add A1
    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA, nodeA.wallet)
    let addedBlock = await nodeA.chain.addBlock(blockA1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B1
    const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB, nodeB.wallet)
    addedBlock = await nodeB.chain.addBlock(blockB1)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B2
    const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB, nodeB.wallet)
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
    // need separate node because a node cannot have a view only wallet + spend wallet for same account
    const { node: viewOnlyNode } = await nodeTest.createSetup()
    const chain = nodeTest.chain
    const viewOnlyChain = viewOnlyNode.chain

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
      createdAt: null,
    }
    const viewOnlyAccount = await viewOnlyNode.wallet.importAccount(accountValue)

    // Create a block with a miner's fee
    const minersfee = await strategy.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    const addResultViewOnly = await viewOnlyChain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()
    expect(addResultViewOnly.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.updateHead()
    await viewOnlyNode.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
    await expect(
      viewOnlyNode.wallet.getBalance(viewOnlyAccount, Asset.nativeId()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // Spend the balance
    const transaction = await node.wallet.send({
      account,
      outputs: [
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
      expiration: 0,
    })

    // Create a block with a miner's fee
    const minersfee2 = await strategy.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    const addResultViewOnly2 = await viewOnlyChain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()
    expect(addResultViewOnly2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.updateHead()
    await viewOnlyNode.wallet.updateHead()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
    await expect(
      viewOnlyNode.wallet.getBalance(viewOnlyAccount, Asset.nativeId()),
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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { setCreatedAt: false })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { setCreatedAt: false })
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

        const { transaction } = await nodeA.wallet.post({
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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { setCreatedAt: false })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { setCreatedAt: false })
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

        const { transaction } = await nodeA.wallet.post({
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

  describe('mint', () => {
    describe('for an identifier not stored in the database', () => {
      it('throws a not found exception', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const assetId = Buffer.alloc(ASSET_ID_LENGTH)
        await expect(
          node.wallet.mint(account, {
            assetId,
            fee: BigInt(0),
            expirationDelta: node.config.get('transactionExpirationDelta'),
            value: BigInt(1),
          }),
        ).rejects.toThrow(
          `Asset not found. Cannot mint for identifier '${assetId.toString('hex')}'`,
        )
      })
    })

    describe('for a valid asset identifier', () => {
      it('adds balance for the asset from the wallet', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')

        const mintValueA = BigInt(2)
        const mintBlockA = await useMintBlockFixture({
          node,
          account,
          asset,
          value: mintValueA,
          sequence: 3,
        })
        await expect(node.chain).toAddBlock(mintBlockA)
        await node.wallet.updateHead()

        const mintValueB = BigInt(10)
        const transaction = await useTxFixture(node.wallet, account, account, () => {
          return node.wallet.mint(account, {
            assetId: asset.id(),
            fee: BigInt(0),
            expirationDelta: node.config.get('transactionExpirationDelta'),
            value: mintValueB,
          })
        })

        const mintBlock = await node.chain.newBlock(
          [transaction],
          await node.strategy.createMinersFee(transaction.fee(), 4, generateKey().spendingKey),
        )
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.updateHead()

        expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
          unconfirmed: BigInt(mintValueA + mintValueB),
          unconfirmedCount: 0,
          confirmed: BigInt(mintValueA + mintValueB),
        })
      })
    })

    describe('for a valid metadata and name', () => {
      it('returns a transaction with matching mint descriptions', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
        const mintValue = BigInt(10)
        const mintData = {
          creator: asset.creator().toString('hex'),
          name: asset.name().toString('utf8'),
          metadata: asset.metadata().toString('utf8'),
          value: mintValue,
          isNewAsset: true,
        }

        const transaction = await usePostTxFixture({
          node: node,
          wallet: node.wallet,
          from: account,
          mints: [mintData],
        })

        expect(transaction.mints).toEqual([
          {
            asset: asset,
            value: mintValue,
            owner: asset.creator(),
            transferOwnershipTo: null,
          },
        ])
      })

      it('adds balance for the asset from the wallet', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
        const value = BigInt(10)
        const mintBlock = await useMintBlockFixture({
          node,
          account,
          asset,
          value,
          sequence: 3,
        })
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.updateHead()

        expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
          unconfirmed: BigInt(value),
          unconfirmedCount: 0,
          confirmed: BigInt(value),
        })
      })
    })
  })

  describe('burn', () => {
    it('returns a transaction with matching burn descriptions', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const burnValue = BigInt(2)
      const transaction = await usePostTxFixture({
        node: node,
        wallet: node.wallet,
        from: account,
        burns: [{ assetId: asset.id(), value: burnValue }],
      })

      expect(transaction.burns).toEqual([{ assetId: asset.id(), value: burnValue }])
    })

    it('subtracts balance for the asset from the wallet', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const burnValue = BigInt(2)
      const burnBlock = await useBurnBlockFixture({
        node,
        account,
        asset,
        value: burnValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.updateHead()

      expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
        unconfirmed: BigInt(8),
        unconfirmedCount: 0,
        confirmed: BigInt(8),
      })
    })
  })

  describe.only('frost', () => {
    it('can do a multisig transaction', async () => {
      const seed = 420

      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)
      const recipient = await useAccountFixture(node.wallet, 'recipient')
      const coordinatorSaplingKey = generateKey()

      const trustedDealerPackage = splitSecret(
        coordinatorSaplingKey.spendingKey,
        2,
        3,
        account.spendingKey,
      )

      // import view-only account using shared multisig keys
      const multiSigAccount = await node.wallet.importAccount({
        version: 2,
        id: uuid(),
        name: 'multisig',
        spendingKey: null,
        createdAt: null,
        ...trustedDealerPackage,
      })

      // frost round one
      const roundOneSigningData: Record<string, RoundOneSigningData> = {}
      for (const identifier in trustedDealerPackage.keyPackages) {
        const keyPackage = trustedDealerPackage.keyPackages[identifier]
        roundOneSigningData[identifier] = frostRoundOne(keyPackage, seed)
      }

      // mine block to send IRON to multisig account
      const miner = await useAccountFixture(node.wallet, 'miner')
      const block = await useMinerBlockFixture(node.chain, undefined, miner)
      await expect(node.chain).toAddBlock(block)
      await node.wallet.updateHead()

      const transaction = await node.wallet.send({
        account: miner,
        outputs: [
          {
            publicAddress: multiSigAccount.publicAddress,
            amount: BigInt(2),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        fee: BigInt(0),
      })

      // Create a block with a miner's fee and the transaction to send IRON to the multisig account
      const minersfee2 = await nodeTest.strategy.createMinersFee(
        transaction.fee(),
        block.header.sequence + 1,
        generateKey().spendingKey,
      )
      const newBlock2 = await node.chain.newBlock([transaction], minersfee2)
      const addResult2 = await node.chain.addBlock(newBlock2)
      expect(addResult2.isAdded).toBeTruthy()

      await node.wallet.updateHead()

      // verify multisig account can see its IRON
      expect(await node.wallet.getBalance(multiSigAccount, Asset.nativeId())).toMatchObject({
        unconfirmed: BigInt(2),
      })

      // create transaction from multisig account back to miner
      const rawTransaction = await node.wallet.createTransaction({
        account: multiSigAccount,
        outputs: [
          {
            publicAddress: recipient.publicAddress,
            amount: 2n,
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        fee: 0n,
      })

      const unsignedTransaction = rawTransaction.build(
        trustedDealerPackage.publicKeyPackage,
        trustedDealerPackage.proofGenerationKey,
        trustedDealerPackage.viewKey,
        trustedDealerPackage.outgoingViewKey,
        trustedDealerPackage.publicAddress,
        trustedDealerPackage.publicAddress,
        0n,
      )

      const signingCommitments: Record<string, SigningCommitment> = {}
      for (const identifier in roundOneSigningData) {
        const signingData = roundOneSigningData[identifier]
        signingCommitments[identifier] = {
          binding: signingData.commitmentBinding,
          hiding: signingData.commitmentHiding,
        }
      }

      const signingPackageCommitments = { commitments: signingCommitments }

      const signingPackage = unsignedTransaction.createCoordinatorSigningPackage(
        signingPackageCommitments,
      )

      const signatureShares: Record<string, string> = {}
      for (const identifier in trustedDealerPackage.keyPackages) {
        const keyPackage = trustedDealerPackage.keyPackages[identifier]
        signatureShares[identifier] = frostRoundTwo(
          signingPackage.signingPackage,
          keyPackage,
          signingPackage.publicKeyRandomness,
          seed,
        )
      }

      const serializedFrostTransaction = unsignedTransaction.postFrostAggregate(
        trustedDealerPackage.publicKeyPackage,
        signingPackage.signingPackage,
        signatureShares,
      )
      const frostTransaction = new Transaction(serializedFrostTransaction)

      const minersfee3 = await nodeTest.strategy.createMinersFee(
        transaction.fee(),
        newBlock2.header.sequence + 1,
        generateKey().spendingKey,
      )
      const frostBlock = await node.chain.newBlock([frostTransaction], minersfee3)
      await node.chain.addBlock(newBlock2)
      await expect(node.chain).toAddBlock(frostBlock)
      await node.wallet.updateHead()

      expect(await node.wallet.getBalance(recipient, Asset.nativeId())).toMatchObject({
        unconfirmed: BigInt(2),
      })
    }, 100000)
  })
})
