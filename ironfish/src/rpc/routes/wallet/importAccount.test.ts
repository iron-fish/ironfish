/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  generateKey,
  LanguageCode,
  ParticipantSecret,
  spendingKeyToWords,
} from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { createTrustedDealerKeyPackages } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { encodeAccount } from '../../../wallet/account/encoder/account'
import { Bech32Encoder } from '../../../wallet/account/encoder/bech32'
import { Bech32JsonEncoder } from '../../../wallet/account/encoder/bech32json'
import { AccountFormat } from '../../../wallet/account/encoder/encoder'
import { RpcClient } from '../../clients'
import { ImportResponse } from './importAccount'
import { CreateParticipantResponse } from './multisig/createParticipant'

describe('Route wallet/importAccount', () => {
  const routeTest = createRouteTest(true)

  beforeAll(() => {
    jest
      .spyOn(routeTest.node.wallet, 'scanTransactions')
      .mockImplementation(async () => Promise.resolve())
  })

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

  it('should import a multisig account that has no spending key', async () => {
    const trustedDealerPackages = createTrustedDealerKeyPackages()

    const accountName = 'multisig'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importAccount', {
        account: {
          version: 1,
          name: accountName,
          viewKey: trustedDealerPackages.viewKey,
          incomingViewKey: trustedDealerPackages.incomingViewKey,
          outgoingViewKey: trustedDealerPackages.outgoingViewKey,
          publicAddress: trustedDealerPackages.publicAddress,
          spendingKey: null,
          createdAt: null,
          proofAuthorizingKey: trustedDealerPackages.proofAuthorizingKey,
          multisigKeys: {
            publicKeyPackage: trustedDealerPackages.publicKeyPackage,
          },
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: false,
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

  describe('import rescanning', () => {
    let nodeClient: RpcClient | null = null

    beforeAll(() => {
      nodeClient = routeTest.node.wallet.nodeClient
    })

    afterEach(() => {
      // restore nodeClient to original value
      Object.defineProperty(routeTest.node.wallet, 'nodeClient', { value: nodeClient })
    })

    it('should not skip rescan if nodeClient is null', async () => {
      const key = generateKey()

      // set nodeClient to null
      Object.defineProperty(routeTest.node.wallet, 'nodeClient', { value: null })

      const skipRescanSpy = jest.spyOn(routeTest.node.wallet, 'skipRescan')

      const accountName = 'baz'
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
          // set rescan to true so that skipRescan should not be called
          rescan: true,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: accountName,
      })

      expect(skipRescanSpy).not.toHaveBeenCalled()
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
        proofAuthorizingKey: key.proofAuthorizingKey,
      }
    }

    it('should import a string json encoded account', async () => {
      const name = 'json'
      const jsonString = encodeAccount(createAccountImport(name), AccountFormat.JSON)

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
      const bech32 = new Bech32Encoder().encode(createAccountImport(name))

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

    it('should import a base64 encoded account', async () => {
      const name = 'base64'
      const base64 = encodeAccount(createAccountImport(name), AccountFormat.Base64Json)

      const response = await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: base64,
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
      const importTestCaseFiles = fs
        .readdirSync(testCaseDir, { withFileTypes: true })
        .filter((testCaseFile) => testCaseFile.isFile())
        .map((testCaseFile) => testCaseFile.name)

      expect(importTestCaseFiles.length).toBeGreaterThan(0)

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

    describe('with multisig encryption', () => {
      it('should import a base64 encoded account', async () => {
        const name = 'multisig-encrypted-base64'

        const identity = (
          await routeTest.client
            .request<CreateParticipantResponse>('wallet/multisig/createParticipant', { name })
            .waitForEnd()
        ).content.identity
        const base64 = encodeAccount(createAccountImport(name), AccountFormat.Base64Json, {
          encryptWith: { kind: 'MultisigIdentity', identity: Buffer.from(identity, 'hex') },
        })

        const response = await routeTest.client
          .request<ImportResponse>('wallet/importAccount', {
            name,
            account: base64,
            rescan: false,
          })
          .waitForEnd()

        expect(response.status).toBe(200)
        expect(response.content).toMatchObject({
          name,
          isDefaultAccount: false, // This is false because the default account is already imported in a previous test
        })
      })

      it('should fail to import a base64 encoded account if no multisig identity was generated', async () => {
        const name = 'multisig-encrypted-base64 (no key)'

        const identity = ParticipantSecret.random().toIdentity()
        const base64 = encodeAccount(createAccountImport(name), AccountFormat.Base64Json, {
          encryptWith: { kind: 'MultisigIdentity', identity },
        })

        await expect(
          routeTest.client
            .request<ImportResponse>('wallet/importAccount', {
              name,
              account: base64,
              rescan: false,
            })
            .waitForEnd(),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining(
              'Encrypted multisig account cannot be decrypted without a corresponding multisig secret',
            ),
            status: 400,
          }),
        )
      })

      it('should fail to import a base64 encode account if the wrong multisig identity is used', async () => {
        const name = 'multisig-encrypted-base64 (wrong key)'

        await routeTest.client
          .request<CreateParticipantResponse>('wallet/multisig/createParticipant', { name })
          .waitForEnd()
        const encryptingParticipant = ParticipantSecret.random().toIdentity()
        const base64 = encodeAccount(createAccountImport(name), AccountFormat.Base64Json, {
          encryptWith: { kind: 'MultisigIdentity', identity: encryptingParticipant },
        })

        await expect(
          routeTest.client
            .request<ImportResponse>('wallet/importAccount', {
              name,
              account: base64,
              rescan: false,
            })
            .waitForEnd(),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Encrypted multisig account cannot be decrypted without a corresponding multisig secret'),
            status: 400,
          }),
        )
      })

      it('should import old account export formats', async () => {
        const testCaseSuffix = '.txt'
        const keySuffix = '.key'
        const testCaseDir = path.join(__dirname, '__importTestCases__', 'multisigEncrypted')
        const importTestCaseFiles = fs
          .readdirSync(testCaseDir, { withFileTypes: true })
          .filter(
            (testCaseFile) =>
              testCaseFile.isFile() && testCaseFile.name.endsWith(testCaseSuffix),
          )
          .map((testCaseFile) => testCaseFile.name)

        expect(importTestCaseFiles.length).toBeGreaterThan(0)

        for (const testCaseFile of importTestCaseFiles) {
          const testCase = await fs.promises.readFile(path.join(testCaseDir, testCaseFile), {
            encoding: 'ascii',
          })

          const keyFile = testCaseFile.slice(0, -testCaseSuffix.length) + keySuffix
          const key = await fs.promises.readFile(path.join(testCaseDir, keyFile))
          const secret = new ParticipantSecret(key)
          const identity = secret.toIdentity()

          await routeTest.node.wallet.walletDb.putMultisigSecret(identity.serialize(), {
            secret: secret.serialize(),
            name: testCaseFile,
          })

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
})
