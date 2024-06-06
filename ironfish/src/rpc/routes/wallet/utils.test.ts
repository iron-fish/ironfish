/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { getAccount, getAccountDecryptedNotes } from './utils'

describe('Accounts utils', () => {
  describe('getAccount', () => {
    const routeTest = createRouteTest(true)
    const name = 'testAccount'
    let publicAddress = ''

    beforeAll(async () => {
      const account = await routeTest.node.wallet.createAccount(name)
      publicAddress = account.publicAddress
    })

    it('should fail if account is not found with name', () => {
      expect(() => {
        getAccount(routeTest.node.wallet, 'badAccount')
      }).toThrow('No account with name')
    })

    it('should pass if account is found with name', () => {
      const result = getAccount(routeTest.node.wallet, name)
      expect(result.name).toEqual(name)
      expect(result.publicAddress).toEqual(publicAddress)
    })

    it('should fail if no default account account is set', async () => {
      await routeTest.node.wallet.setDefaultAccount(null)

      expect(() => {
        getAccount(routeTest.node.wallet)
      }).toThrow('No account is currently active')
    })

    it('should pass if default account is found', async () => {
      await routeTest.node.wallet.setDefaultAccount(name)
      const result = getAccount(routeTest.node.wallet)
      expect(result.name).toEqual(name)
      expect(result.publicAddress).toEqual(publicAddress)
    })
  })

  describe('getAccountDecryptedNotes', () => {
    const nodeTest = createNodeTest()

    it('returns notes that an account received or sent in a transaction', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const { block, transaction } = await useBlockWithTx(node, accountA, accountB, true)
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const transactionValue = await accountA.getTransaction(transaction.hash())

      Assert.isNotUndefined(transactionValue)

      // accountA should have both notes since it sent the transaction
      const accountANotes = await getAccountDecryptedNotes(
        node.workerPool,
        accountA,
        transactionValue,
      )
      expect(accountANotes.length).toEqual(2)

      // accountB should only have one note since it received the transaction
      const accountBNotes = await getAccountDecryptedNotes(
        node.workerPool,
        accountB,
        transactionValue,
      )
      expect(accountBNotes.length).toEqual(1)
    })
    it('should not decrypt notes that the account did not send and did not receive', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const { block, transaction } = await useBlockWithTx(node, accountA, accountB, true)
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const transactionValue = await accountA.getTransaction(transaction.hash())

      Assert.isNotUndefined(transactionValue)

      const decryptSpy = jest.spyOn(node.workerPool, 'decryptNotes')

      // accountB should only have one note since it received the transaction
      const accountBNotes = await getAccountDecryptedNotes(
        node.workerPool,
        accountB,
        transactionValue,
      )
      expect(accountBNotes.length).toEqual(1)

      // accountB did not send the transaction and has already decrypted the
      // note it owns, so we don't need to decrypt again
      expect(decryptSpy).not.toHaveBeenCalled()
    })
  })
})
