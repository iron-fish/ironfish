/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address, hexToBytes } from '@ethereumjs/util'
import { createNodeTest } from '../../testUtilities'

describe('BlockchainDBTransaction', () => {
  const nodeTest = createNodeTest()

  it('should update state if tx succeeds', async () => {
    const { node } = nodeTest
    const stateManager = node.chain.blockchainDb.stateManager

    const address = new Address(hexToBytes('0x0e5069fd80d59b92e359dade34f6a66f0bf8dcc5'))
    const account = new Account(BigInt(0), 100000n)

    await expect(
      node.chain.blockchainDb.stateManager.getAccount(address),
    ).resolves.toBeUndefined()

    await node.chain.blockchainDb.withTransaction(null, async (_) => {
      await stateManager.checkpoint()
      await stateManager.putAccount(address, account)
      await stateManager.commit()
    })

    const newAccount = await node.chain.blockchainDb.stateManager.getAccount(address)

    expect(newAccount).not.toBeUndefined()
    expect(newAccount?.balance).toEqual(100000n)
  })

  it('should update the stateManager state root if tx succeeds', async () => {
    const { node } = nodeTest
    const stateManager = node.chain.blockchainDb.stateManager
    const stateRoot = await stateManager.getStateRoot()

    const address = new Address(hexToBytes('0x0e5069fd80d59b92e359dade34f6a66f0bf8dcc5'))
    const account = new Account(BigInt(0), 100000n)

    await node.chain.blockchainDb.withTransaction(null, async (_) => {
      await stateManager.checkpoint()
      await stateManager.putAccount(address, account)
      await stateManager.commit()
    })
    const newStateRoot = await stateManager.getStateRoot()

    expect(newStateRoot).not.toEqual(stateRoot)
  })

  it('should revert state changes if tx aborts', async () => {
    const { node } = nodeTest
    const stateManager = node.chain.blockchainDb.stateManager

    const address = new Address(hexToBytes('0x0e5069fd80d59b92e359dade34f6a66f0bf8dcc5'))
    const account = new Account(BigInt(0), 100000n)

    await expect(
      node.chain.blockchainDb.stateManager.getAccount(address),
    ).resolves.toBeUndefined()

    await node.chain.blockchainDb.withTransaction(null, async (tx) => {
      await stateManager.checkpoint()
      await stateManager.putAccount(address, account)
      await stateManager.commit()
      await tx.abort()
    })

    await expect(
      node.chain.blockchainDb.stateManager.getAccount(address),
    ).resolves.toBeUndefined()
  })

  it('should not change the stateManager state root if tx aborts', async () => {
    const { node } = nodeTest
    const stateManager = node.chain.blockchainDb.stateManager
    const stateRoot = await stateManager.getStateRoot()

    const address = new Address(hexToBytes('0x0e5069fd80d59b92e359dade34f6a66f0bf8dcc5'))
    const account = new Account(BigInt(0), 100000n)

    await node.chain.blockchainDb.withTransaction(null, async (tx) => {
      await stateManager.checkpoint()
      await stateManager.putAccount(address, account)
      await stateManager.commit()
      await tx.abort()
    })
    const newStateRoot = await stateManager.getStateRoot()

    expect(newStateRoot).toEqual(stateRoot)
  })
})
