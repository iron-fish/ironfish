/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SpiedFunction } from 'jest-mock'
import {
  Asset,
  ASSET_ID_LENGTH,
  generateKey,
  multisig,
  Note as NativeNote,
  verifyTransactions,
} from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { makeFakeWitness } from '../devUtils'
import { Note, RawTransaction, Transaction } from '../primitives'
import { Target } from '../primitives/target'
import { TransactionVersion } from '../primitives/transaction'
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
import { AssertMultisigSigner } from '../wallet'

describe('Wallet', () => {
  const nodeTest = createNodeTest()
  let targetMeetsSpy: SpiedFunction<typeof Target.meets>
  let targetSpy: SpiedFunction<typeof Target.calculateTarget>

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
    await node.wallet.scan()

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    await node.wallet.scan()

    // Balance after adding the genesis block should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await nodeTest.chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await node.wallet.scan()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })
  })

  it('Lowers the balance after using send to spend a note', async () => {
    // Initialize the database and chain
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test')

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
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
          memo: Buffer.alloc(32),
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
      expiration: 0,
    })

    // Create a block with a miner's fee
    const minersfee2 = await chain.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  })

  it('Creates valid transactions when the worker pool is enabled', async () => {
    // Initialize the database and chain
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test')

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
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
          memo: Buffer.alloc(32),
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
    const minersfee2 = await chain.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 2 should be 1999999998
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })
  })

  it('creates valid transactions with multiple outputs', async () => {
    // Initialize the database and chain
    const node = nodeTest.node
    const chain = nodeTest.chain

    const account = await useAccountFixture(node.wallet, 'test')

    // Initial balance should be 0
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Balance after adding the genesis block should be 0
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
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
          memo: Buffer.from('recipient 1'),
          assetId: Asset.nativeId(),
        },
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: Buffer.from('recipient 2'),
          assetId: Asset.nativeId(),
        },
        {
          publicAddress: generateKey().publicAddress,
          amount: BigInt(2),
          memo: Buffer.from('recipient 3'),
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
    const minersfee2 = await chain.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      generateKey().spendingKey,
    )
    const newBlock2 = await chain.newBlock([transaction], minersfee2)
    const addResult2 = await chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    // Balance after adding the transaction that spends 6 should be 1999999994
    await node.wallet.scan()
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
            memo: Buffer.alloc(32),
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
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
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
          memo: Buffer.alloc(32),
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
    const minersfee2 = await chain.createMinersFee(
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
    await node.wallet.scan()
    await expect(node.wallet.getBalance(account, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    await expect(chain).toAddBlock(newBlock)

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
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
          memo: Buffer.alloc(32),
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
    const minersfee2 = await chain.createMinersFee(
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
    await nodeA.wallet.scan()
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
            memo: Buffer.alloc(32),
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
        await nodeA.chain.createMinersFee(transaction.fee(), 3, generateKey().spendingKey),
      )
    })

    await nodeA.chain.addBlock(block2)
    await nodeA.wallet.scan()

    // Attempting to create another transaction for account A
    // to account C should not throw an error
    await expect(
      nodeA.wallet.createTransaction({
        account: accountA,
        outputs: [
          {
            publicAddress: accountC.publicAddress,
            amount: BigInt(1),
            memo: Buffer.alloc(32),
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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { createdAt: null })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { createdAt: null })

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
    await nodeA.wallet.scan()
    await nodeB.wallet.scan()

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
    await nodeA.wallet.scan()

    // Copy block B2 to nodeA
    await nodeA.chain.addBlock(blockB2)
    await nodeA.wallet.scan()
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
      proofAuthorizingKey: account.proofAuthorizingKey,
      ledger: true,
    }
    const viewOnlyAccount = await viewOnlyNode.wallet.importAccount(accountValue)

    // Create a block with a miner's fee
    const minersfee = await chain.createMinersFee(BigInt(0), 2, account.spendingKey)
    const newBlock = await chain.newBlock([], minersfee)
    const addResult = await chain.addBlock(newBlock)
    const addResultViewOnly = await viewOnlyChain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()
    expect(addResultViewOnly.isAdded).toBeTruthy()

    // Account should now have a balance of 2000000000 after adding the miner's fee
    await node.wallet.scan()
    await viewOnlyNode.wallet.scan()
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
          memo: Buffer.alloc(32),
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
      expirationDelta: node.config.get('transactionExpirationDelta'),
      expiration: 0,
    })

    // Create a block with a miner's fee
    const minersfee2 = await chain.createMinersFee(
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
    await node.wallet.scan()
    await viewOnlyNode.wallet.scan()
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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { createdAt: null })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { createdAt: null })
    const accountBNodeA = await nodeA.wallet.importAccount(accountB)
    const accountANodeB = await nodeB.wallet.importAccount(accountA)

    // Create and add Block 1
    const block1 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
    let addedBlock = await nodeA.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)
    addedBlock = await nodeB.chain.addBlock(block1)
    expect(addedBlock.isAdded).toBe(true)

    await nodeA.wallet.scan()

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
              memo: Buffer.alloc(32),
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
          await nodeA.chain.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
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
    await nodeA.wallet.scan()
    await nodeB.wallet.scan()

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
    await nodeA.wallet.scan()

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

    const accountA = await useAccountFixture(nodeA.wallet, 'testA', { createdAt: null })
    const accountB = await useAccountFixture(nodeB.wallet, 'testB', { createdAt: null })
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
    await nodeB.wallet.scan()

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
              memo: Buffer.alloc(32),
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
          await nodeA.chain.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
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
        await nodeB.chain.createMinersFee(BigInt(0), 3, generateKey().spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB2)
    expect(addedBlock.isAdded).toBe(true)

    // Create and add B3
    const blockB3 = await useBlockFixture(nodeB.chain, async () =>
      nodeB.chain.newBlock(
        [],
        await nodeB.chain.createMinersFee(BigInt(0), 4, generateKey().spendingKey),
      ),
    )
    addedBlock = await nodeB.chain.addBlock(blockB3)
    expect(addedBlock.isAdded).toBe(true)

    // Update account head and check all balances
    await nodeA.wallet.scan()
    await nodeB.wallet.scan()

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
    await nodeA.wallet.scan()

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
        await node.wallet.scan()

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
        await node.wallet.scan()

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
          await node.chain.createMinersFee(transaction.fee(), 4, generateKey().spendingKey),
        )
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.scan()

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
        await node.wallet.scan()

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
        await node.wallet.scan()

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
        await node.wallet.scan()

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
      await node.wallet.scan()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

      const burnValue = BigInt(2)
      const burnBlock = await useBurnBlockFixture({
        node,
        account,
        asset,
        value: burnValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.scan()

      expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
        unconfirmed: BigInt(8),
        unconfirmedCount: 0,
        confirmed: BigInt(8),
      })
    })
  })

  describe('frost', () => {
    it('can do a multisig transaction', async () => {
      const minSigners = 2

      const { node } = await nodeTest.createSetup()
      const recipient = await useAccountFixture(node.wallet, 'recipient')

      const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
      const identities = await Promise.all(
        accountNames.map(async (name) => {
          const secret = multisig.ParticipantSecret.random()
          const identity = secret.toIdentity()

          await node.wallet.walletDb.putMultisigIdentity(identity.serialize(), {
            name,
            secret: secret.serialize(),
          })
          return identity.serialize().toString('hex')
        }),
      )

      // construct 3 separate secrets for the participants
      // take the secrets and get identities back (get identity first then identifier)

      const trustedDealerPackage = multisig.generateAndSplitKey(minSigners, identities)

      const getMultisigKeys = (index: number) => {
        return {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
          identity: trustedDealerPackage.keyPackages[index].identity,
          keyPackage: trustedDealerPackage.keyPackages[index].keyPackage,
        }
      }

      const participantA = await node.wallet.importAccount({
        version: 2,
        name: trustedDealerPackage.keyPackages[0].identity,
        spendingKey: null,
        createdAt: null,
        multisigKeys: getMultisigKeys(0),
        ...trustedDealerPackage,
        ledger: false,
      })
      const participantB = await node.wallet.importAccount({
        version: 2,
        name: trustedDealerPackage.keyPackages[1].identity,
        spendingKey: null,
        createdAt: null,
        multisigKeys: getMultisigKeys(1),
        ...trustedDealerPackage,
        ledger: false,
      })
      const participantC = await node.wallet.importAccount({
        version: 2,
        name: trustedDealerPackage.keyPackages[2].identity,
        spendingKey: null,
        createdAt: null,
        multisigKeys: getMultisigKeys(2),
        ...trustedDealerPackage,
        ledger: false,
      })

      const participants = [participantA, participantB, participantC]

      const coordinator = await node.wallet.importAccount({
        version: 4,
        name: 'coordinator',
        spendingKey: null,
        createdAt: null,
        multisigKeys: {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        ...trustedDealerPackage,
        ledger: false,
      })

      // When importing an account through the SDK, we need to kick off a scan.
      await node.wallet.scan()

      // mine block to send IRON to multisig account
      const miner = await useAccountFixture(node.wallet, 'miner')
      const block = await useMinerBlockFixture(node.chain, undefined, miner)
      await expect(node.chain).toAddBlock(block)
      await node.wallet.scan()

      // we are using participant B and sending the transaction below from participant A
      // to make it extremely obvious that the participants in the multisig account control
      // the same account.
      const transaction = await node.wallet.send({
        account: miner,
        outputs: [
          {
            publicAddress: participantB.publicAddress,
            amount: BigInt(2),
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        fee: BigInt(0),
      })

      // Create a block with a miner's fee and the transaction to send IRON to the multisig account
      const minersfee2 = await nodeTest.chain.createMinersFee(
        transaction.fee(),
        block.header.sequence + 1,
        miner.spendingKey,
      )
      const newBlock2 = await node.chain.newBlock([transaction], minersfee2)
      const addResult2 = await node.chain.addBlock(newBlock2)
      expect(addResult2.isAdded).toBeTruthy()

      await node.wallet.scan()

      // verify multisig account can see its IRON
      expect(await node.wallet.getBalance(participantA, Asset.nativeId())).toMatchObject({
        unconfirmed: BigInt(2),
      })

      // create transaction from multisig account back to miner
      const rawTransaction = await node.wallet.createTransaction({
        account: participantA,
        outputs: [
          {
            publicAddress: recipient.publicAddress,
            amount: 2n,
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        fee: 0n,
      })

      const unsignedTransaction = rawTransaction.build(
        trustedDealerPackage.proofAuthorizingKey,
        trustedDealerPackage.viewKey,
        trustedDealerPackage.outgoingViewKey,
      )
      const transactionHash = unsignedTransaction.hash()

      const signers = participants.map((participant) => {
        AssertMultisigSigner(participant)
        const secret = new multisig.ParticipantSecret(
          Buffer.from(participant.multisigKeys.secret, 'hex'),
        )
        return secret.toIdentity().serialize().toString('hex')
      })

      const signingCommitments: string[] = []
      for (const participant of participants) {
        AssertMultisigSigner(participant)
        signingCommitments.push(
          multisig.createSigningCommitment(
            participant.multisigKeys.secret,
            participant.multisigKeys.keyPackage,
            transactionHash,
            signers,
          ),
        )
      }

      const signingPackage = unsignedTransaction.signingPackage(signingCommitments)

      const signatureShares: Array<string> = []

      for (const participant of participants) {
        AssertMultisigSigner(participant)
        signatureShares.push(
          multisig.createSignatureShare(
            participant.multisigKeys.secret,
            participant.multisigKeys.keyPackage,
            signingPackage,
          ),
        )
      }

      Assert.isNotUndefined(coordinator.multisigKeys)
      const serializedFrostTransaction = multisig.aggregateSignatureShares(
        coordinator.multisigKeys.publicKeyPackage,
        signingPackage,
        signatureShares,
      )
      const frostTransaction = new Transaction(serializedFrostTransaction)

      const minersfee3 = await nodeTest.chain.createMinersFee(
        transaction.fee(),
        newBlock2.header.sequence + 1,
        miner.spendingKey,
      )

      expect(await node.wallet.getBalance(recipient, Asset.nativeId())).toMatchObject({
        unconfirmed: BigInt(0),
      })

      const frostBlock = await node.chain.newBlock([frostTransaction], minersfee3)
      await node.chain.addBlock(newBlock2)
      await expect(node.chain).toAddBlock(frostBlock)
      await node.wallet.scan()

      expect(await node.wallet.getBalance(recipient, Asset.nativeId())).toMatchObject({
        unconfirmed: BigInt(2),
      })
    }, 100000)
  })

  it('adds publicKeyPackage identities to walletDb on account import', async () => {
    const minSigners = 2

    const { node } = await nodeTest.createSetup()

    const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
    const identities = await Promise.all(
      accountNames.map(async (name) => {
        const secret = multisig.ParticipantSecret.random()
        const identity = secret.toIdentity()

        await node.wallet.walletDb.putMultisigIdentity(identity.serialize(), {
          name,
          secret: secret.serialize(),
        })
        return identity.serialize().toString('hex')
      }),
    )

    const trustedDealerPackage = multisig.generateAndSplitKey(minSigners, identities)

    const account = await node.wallet.importAccount({
      version: 2,
      name: trustedDealerPackage.keyPackages[0].identity,
      spendingKey: null,
      createdAt: null,
      multisigKeys: {
        publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        identity: trustedDealerPackage.keyPackages[0].identity,
        keyPackage: trustedDealerPackage.keyPackages[0].keyPackage,
      },
      ...trustedDealerPackage,
      ledger: false,
    })

    const storedIdentities = account
      .getMultisigParticipantIdentities()
      .map((identity) => identity.toString('hex'))
    expect(identities.sort()).toEqual(storedIdentities.sort())
  })

  it('build and signs transactions', () => {
    // Generate random key
    const { outgoingViewKey, proofAuthorizingKey, publicAddress, spendingKey, viewKey } =
      generateKey()

    const inNote = new NativeNote(
      publicAddress,
      42n,
      Buffer.from(''),
      Asset.nativeId(),
      publicAddress,
    )
    const outNote = new NativeNote(
      publicAddress,
      40n,
      Buffer.from(''),
      Asset.nativeId(),
      publicAddress,
    )
    const asset = new Asset(publicAddress, 'Testcoin', 'A really cool coin')
    const mintOutNote = new NativeNote(
      publicAddress,
      5n,
      Buffer.from(''),
      asset.id(),
      publicAddress,
    )

    // Construct fake note witness for input note to spend
    const witness = makeFakeWitness(new Note(inNote.serialize()))

    // Construct raw transaction
    const raw = new RawTransaction(TransactionVersion.V1)
    raw.spends.push({ note: new Note(inNote.serialize()), witness })
    raw.outputs.push({ note: new Note(outNote.serialize()) })
    raw.outputs.push({ note: new Note(mintOutNote.serialize()) })
    raw.mints.push({
      creator: asset.creator().toString('hex'),
      name: asset.name().toString(),
      metadata: asset.metadata().toString(),
      value: mintOutNote.value(),
    })
    raw.fee = 1n

    // Build transaction and construct proofs to generate unsigned transaction
    const unsignedTransaction = raw.build(proofAuthorizingKey, viewKey, outgoingViewKey)

    // Sign unsigned transaction
    const serializedTransaction = unsignedTransaction.sign(spendingKey)
    const signedTransaction = new Transaction(serializedTransaction)

    // Check that hash is equal to hash of unsigned transaction
    expect(signedTransaction.unsignedHash()).toEqualBuffer(unsignedTransaction.hash())

    // Check that signed transaction verifies
    expect(verifyTransactions([serializedTransaction])).toBeTruthy()
  })
})
