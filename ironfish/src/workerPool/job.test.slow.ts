/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import tweetnacl from 'tweetnacl'
import { Assert } from '../assert'
import { privateIdentityToIdentity } from '../network/identity'
import { createNodeTest } from '../testUtilities/nodeTest'

describe('Worker Pool', () => {
  const nodeTest = createNodeTest(false, { config: { nodeWorkers: 1 } })

  it('createMinersFee', async () => {
    const { workerPool, strategy } = nodeTest
    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)
    expect(minersFee.serialize()).toBeInstanceOf(Buffer)

    expect(workerPool.completed).toBe(1)
  }, 60000)

  it('verify', async () => {
    const { workerPool } = nodeTest
    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const genesis = await nodeTest.node.chain.getBlock(nodeTest.node.chain.head.hash)
    Assert.isNotNull(genesis)
    const transaction = genesis.transactions[0]
    const verified = await workerPool.verify(transaction, { verifyFees: false })

    expect(verified).toBe(true)
    expect(workerPool.completed).toBe(1)
  }, 60000)

  it('boxMessage and unboxMessage', async () => {
    const { workerPool } = nodeTest
    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const message = 'hello world'
    const identityPrivate = tweetnacl.box.keyPair()
    const identityPublic = privateIdentityToIdentity(identityPrivate)
    const boxed = await workerPool.boxMessage(message, identityPrivate, identityPublic)

    const unboxed = await workerPool.unboxMessage(
      boxed.boxedMessage,
      boxed.nonce,
      identityPublic,
      identityPrivate,
    )

    expect(unboxed.message).toEqual(message)
    expect(workerPool.completed).toBe(2)
  }, 60000)
})
