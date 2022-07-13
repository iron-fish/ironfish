/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GENESIS_BLOCK_SEQUENCE, VerificationResultReason } from '../consensus'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('should reset when chain processor head does not exist in chain', async () => {
    const { node, strategy } = nodeTest
    strategy.disableMiningReward()

    const resetSpy = jest.spyOn(node.accounts, 'reset').mockImplementation()
    jest.spyOn(node.accounts, 'eventLoop').mockImplementation(() => Promise.resolve())

    node.accounts['chainProcessor'].hash = Buffer.from('0')

    await node.accounts.start()
    expect(resetSpy).toBeCalledTimes(1)
  }, 8000)

  it('should handle transaction created on fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.accounts, 'a')
    const accountB = await useAccountFixture(nodeA.accounts, 'b')

    const broadcastSpy = jest.spyOn(nodeA.accounts, 'broadcastTransaction')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.accounts)
    await expect(nodeA.chain).toAddBlock(blockA1)

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // Check nodeA balance
    await nodeA.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // This transaction will be invalid after the reorg
    const invalidTx = await useTxFixture(nodeA.accounts, accountA, accountB)
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    await nodeA.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(1999999999),
    })

    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    expect(nodeA.chain.head.hash.equals(blockB2.header.hash)).toBe(true)

    // We now have this tree with nodeA's wallet trying to spend a note in
    // invalidTx that has been removed once A1 was disconnected from the
    // blockchain after the reorg
    //
    // G -> A1
    //   -> B2 -> B3

    // The transaction should now be considered invalid
    await expect(nodeA.chain.verifier.verifyTransactionAdd(invalidTx)).resolves.toMatchObject({
      reason: VerificationResultReason.INVALID_SPEND,
      valid: false,
    })

    await nodeA.accounts.updateHead()
    await expect(nodeA.accounts.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(3999999999),
    })

    // Check that it was last broadcast at its added height
    let invalidTxEntry = nodeA.accounts['transactionMap'].get(invalidTx.unsignedHash())
    expect(invalidTxEntry?.submittedSequence).toEqual(GENESIS_BLOCK_SEQUENCE)

    // Check that the TX is not rebroadcast but has it's sequence updated
    nodeA.accounts['rebroadcastAfter'] = 1
    nodeA.accounts['isStarted'] = true
    nodeA.chain['synced'] = true
    await nodeA.accounts.rebroadcastTransactions()
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    // It should now be planned to be processed at head + 1
    invalidTxEntry = nodeA.accounts['transactionMap'].get(invalidTx.unsignedHash())
    expect(invalidTxEntry?.submittedSequence).toEqual(blockB2.header.sequence)
  }, 120000)

  describe('getBalance', () => {
    it('returns balances for unspent notes with minimum confirmations on the main chain', async () => {
      const { node: nodeA } = await nodeTest.createSetup({
        config: { minimumBlockConfirmations: 2 },
      })
      const { node: nodeB } = await nodeTest.createSetup()
      const accountA = await useAccountFixture(nodeA.accounts, 'accountA')
      const accountB = await useAccountFixture(nodeB.accounts, 'accountB')

      // G -> A1 -> A2 -> A3 -> A4 -> A5
      //   -> B1 -> B2 -> B3 -> B4
      const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await nodeA.chain.addBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
      await nodeA.chain.addBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(nodeA.chain, 4, accountA)
      await nodeA.chain.addBlock(blockA3)
      const blockA4 = await useMinerBlockFixture(nodeA.chain, 5, accountA)
      await nodeA.chain.addBlock(blockA4)
      const blockA5 = await useMinerBlockFixture(nodeA.chain, 6, accountA)
      await nodeA.chain.addBlock(blockA5)

      const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)
      await nodeB.chain.addBlock(blockB1)
      const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)
      await nodeB.chain.addBlock(blockB2)
      const blockB3 = await useMinerBlockFixture(nodeB.chain, 4, accountB)
      await nodeB.chain.addBlock(blockB3)
      const blockB4 = await useMinerBlockFixture(nodeB.chain, 5, accountB)
      await nodeB.chain.addBlock(blockB4)

      expect(nodeA.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
      expect(nodeB.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

      await nodeB.chain.addBlock(blockA1)
      await nodeB.chain.addBlock(blockA2)
      await nodeB.chain.addBlock(blockA3)
      await nodeB.chain.addBlock(blockA4)
      await nodeB.chain.addBlock(blockA5)

      await nodeA.accounts.updateHead()
      await nodeB.accounts.updateHead()

      expect(nodeA.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
      expect(nodeB.chain.head.hash.equals(blockA5.header.hash)).toBe(true)

      expect(await nodeA.accounts.getBalance(accountA)).toEqual({
        confirmed: BigInt(6000000000),
        unconfirmed: BigInt(10000000000),
      })
      expect(await nodeB.accounts.getBalance(accountB)).toEqual({
        confirmed: BigInt(0),
        unconfirmed: BigInt(0),
      })
    })
  })

  describe('scanTransaction', () => {
    it('should rescan and update chain processor', async () => {
      const { chain, accounts } = await nodeTest.createSetup()

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      // Test this works even if processor is not reset
      await accounts.updateHead()
      expect(accounts['chainProcessor']['hash']?.equals(block1.header.hash)).toBe(true)

      const block2 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block2)

      // Should only scan up to the current procesor head block1
      await accounts.scanTransactions()
      expect(accounts['chainProcessor']['hash']?.equals(block1.header.hash)).toBe(true)

      // Now with a reset chain processor should go to end of chain
      await accounts.reset()
      expect(accounts['chainProcessor']['hash']).toBe(null)

      // This should carry the chain processor to block2
      await accounts.scanTransactions()
      expect(accounts['chainProcessor']['hash']?.equals(block2.header.hash)).toBe(true)
    })
  })
})
