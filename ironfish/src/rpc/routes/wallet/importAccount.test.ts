/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey, LanguageCode, spendingKeyToWords } from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { encodeAccount } from '../../../wallet/account/encoder/account'
import { Bech32JsonEncoder } from '../../../wallet/account/encoder/bech32json'
import { Format } from '../../../wallet/account/encoder/encoder'
import { ImportResponse } from './importAccount'

describe('Route wallet/importAccount', () => {
  const routeTest = createRouteTest(true)

  it('should import a view only account that has no spending key', async () => {
    const key = generateKey()

    const accountName = 'foo'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importAccount', {
        account: {
          name: accountName,
          viewKey: key.viewKey,
          spendingKey: null,
          publicAddress: key.publicAddress,
          incomingViewKey: key.incomingViewKey,
          outgoingViewKey: key.outgoingViewKey,
          version: 1,
          createdAt: null,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: true,
    })
  })

  it('should import a spending account', async () => {
    const key = generateKey()

    const accountName = 'bar'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importAccount', {
        account: {
          name: accountName,
          viewKey: key.viewKey,
          spendingKey: key.spendingKey,
          publicAddress: key.publicAddress,
          incomingViewKey: key.incomingViewKey,
          outgoingViewKey: key.outgoingViewKey,
          version: 1,
          createdAt: null,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: false, // This is false because the default account is already imported in a previous test
    })
  })

  describe('when importing string version of account', () => {
    const createAccountImport = (name: string) => {
      const key = generateKey()
      const accountName = name
      return {
        name: accountName,
        viewKey: key.viewKey,
        spendingKey: key.spendingKey,
        publicAddress: key.publicAddress,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        version: 1,
        createdAt: null,
      }
    }

    it('should import a string json encoded account', async () => {
      const name = 'json'
      const jsonString = encodeAccount(createAccountImport(name), Format.JSON)

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: jsonString,
          rescan: false,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a bech32json encoded account', async () => {
      const name = 'bech32json'
      const bech32Json = new Bech32JsonEncoder().encode(createAccountImport(name))

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: bech32Json,
          rescan: false,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a bech32 encoded account', async () => {
      const name = 'bech32'
      const bech32 = encodeAccount(createAccountImport(name), Format.Bech32)

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: bech32,
          rescan: false,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a spending key encoded account', async () => {
      const name = 'spendingKey'
      const spendingKey = generateKey().spendingKey

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: spendingKey,
          name: name,
          rescan: false,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a mnemonic key encoded account', async () => {
      const name = 'mnemonic'
      const mnemonic = spendingKeyToWords(generateKey().spendingKey, LanguageCode.English)

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: mnemonic,
          name: name,
          rescan: false,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should support importing old account export formats', async () => {
      const testCaseDir = path.join(__dirname, '__importTestCases__')
      const importTestCaseFiles = fs.readdirSync(testCaseDir)

      for (const testCaseFile of importTestCaseFiles) {
        const testCase = await routeTest.sdk.fileSystem.readFile(
          path.join(testCaseDir, testCaseFile),
        )

        const response = await routeTest.client
          .request<ImportResponse>('wallet/importAccount', {
            account: testCase,
            name: testCaseFile,
          })
          .waitForEnd()

        expect(response.status).toBe(200)
        expect(response.content.name).not.toBeNull()
      }
    })
  })
})
