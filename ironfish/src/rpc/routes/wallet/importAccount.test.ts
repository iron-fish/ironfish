/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, LanguageCode, multisig, spendingKeyToWords } from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { createTrustedDealerKeyPackages } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AccountFormat, encodeAccountImport } from '../../../wallet/exporter/account'
import { AccountImport } from '../../../wallet/exporter/accountImport'
import { Bech32Encoder } from '../../../wallet/exporter/encoders/bech32'
import { Bech32JsonEncoder } from '../../../wallet/exporter/encoders/bech32json'
import { RpcClient } from '../../clients'
import { JsonEncoder } from '../../../wallet'

describe('Route wallet/importAccount', () => {
  const routeTest = createRouteTest(true)

  beforeAll(() => {
    jest
      .spyOn(routeTest.node.wallet, 'scan')
      .mockImplementation(async () => Promise.resolve(null))
  })

  it('should import a view only account that has no spending key', async () => {
    const key = generateKey()

    const account: AccountImport = {
      name: 'foo',
      viewKey: key.viewKey,
      spendingKey: null,
      publicAddress: key.publicAddress,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      proofAuthorizingKey: null,
      version: 1,
      createdAt: null,
    }

    const response = await routeTest.client.wallet.importAccount({
      account: new JsonEncoder().encode(account),
      rescan: false,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: 'foo',
      isDefaultAccount: true,
    })
  })

  it('should import a multisig account that has no spending key', async () => {
    const trustedDealerPackages = createTrustedDealerKeyPackages()

    const account: AccountImport = {
      version: 1,
      name: 'multisig',
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
    }

    const response = await routeTest.client.wallet.importAccount({
      account: new JsonEncoder().encode(account),
      rescan: false,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: 'multisig',
      isDefaultAccount: false,
    })
  })

  it('should import a spending account', async () => {
    const key = generateKey()

    const accountName = 'bar'
    const response = await routeTest.client.wallet.importAccount({
      account: new JsonEncoder().encode({
        name: accountName,
        viewKey: key.viewKey,
        spendingKey: key.spendingKey,
        publicAddress: key.publicAddress,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        proofAuthorizingKey: null,
        version: 1,
        createdAt: null,
      }),
      rescan: false,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: false, // This is false because the default account is already imported in a previous test
    })
  })

  it('should import a spending account with the specified name', async () => {
    const key = generateKey()

    const accountName = 'bar'
    const overriddenAccountName = 'not-bar'
    const response = await routeTest.client.wallet.importAccount({
      account: new JsonEncoder().encode({
        name: accountName,
        viewKey: key.viewKey,
        spendingKey: key.spendingKey,
        publicAddress: key.publicAddress,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        proofAuthorizingKey: null,
        version: 1,
        createdAt: null,
      }),
      name: overriddenAccountName,
      rescan: false,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: overriddenAccountName,
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
      const account: AccountImport = {
        name: accountName,
        viewKey: key.viewKey,
        spendingKey: key.spendingKey,
        publicAddress: key.publicAddress,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        proofAuthorizingKey: null,
        version: 1,
        createdAt: null,
      }

      const response = await routeTest.client.wallet.importAccount({
        account: new JsonEncoder().encode(account),
        // set rescan to true so that skipRescan should not be called
        rescan: true,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: accountName,
      })

      expect(skipRescanSpy).not.toHaveBeenCalled()
    })
  })

  describe('when importing string version of account', () => {
    const createAccountImport = (name: string): AccountImport => {
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
      const jsonString = encodeAccountImport(createAccountImport(name), AccountFormat.JSON)

      const response = await routeTest.client.wallet.importAccount({
        account: jsonString,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a bech32json encoded account', async () => {
      const name = 'bech32json'
      const bech32Json = new Bech32JsonEncoder().encode(createAccountImport(name))

      const response = await routeTest.client.wallet.importAccount({
        account: bech32Json,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a bech32 encoded account', async () => {
      const name = 'bech32'
      const bech32 = new Bech32Encoder().encode(createAccountImport(name))

      const response = await routeTest.client.wallet.importAccount({
        account: bech32,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a base64 encoded account', async () => {
      const name = 'base64'
      const base64 = encodeAccountImport(createAccountImport(name), AccountFormat.Base64Json)

      const response = await routeTest.client.wallet.importAccount({
        account: base64,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a spending key encoded account', async () => {
      const name = 'spendingKey'
      const spendingKey = generateKey().spendingKey

      const response = await routeTest.client.wallet.importAccount({
        account: spendingKey,
        name: name,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
        isDefaultAccount: false, // This is false because the default account is already imported in a previous test
      })
    })

    it('should import a mnemonic key encoded account', async () => {
      const name = 'mnemonic'
      const mnemonic = spendingKeyToWords(generateKey().spendingKey, LanguageCode.English)

      const response = await routeTest.client.wallet.importAccount({
        account: mnemonic,
        name: name,
        rescan: false,
      })

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

        const response = await routeTest.client.wallet.importAccount({
          account: testCase,
          name: testCaseFile,
        })

        expect(response.status).toBe(200)
        expect(response.content.name).not.toBeNull()
      }
    })

    describe('with multisig encryption', () => {
      it('should import a base64 encoded account', async () => {
        const name = 'multisig-encrypted-base64'

        const identity = (await routeTest.client.wallet.multisig.createParticipant({ name }))
          .content.identity
        const base64 = encodeAccountImport(
          createAccountImport(name),
          AccountFormat.Base64Json,
          {
            encryptWith: { kind: 'MultisigIdentity', identity: Buffer.from(identity, 'hex') },
          },
        )

        const response = await routeTest.client.wallet.importAccount({
          name,
          account: base64,
          rescan: false,
        })

        expect(response.status).toBe(200)
        expect(response.content).toMatchObject({
          name,
          isDefaultAccount: false, // This is false because the default account is already imported in a previous test
        })
      })

      it('should fail to import a base64 encoded account if no multisig identity was generated', async () => {
        const name = 'multisig-encrypted-base64 (no key)'

        const identity = multisig.ParticipantSecret.random().toIdentity()
        const base64 = encodeAccountImport(
          createAccountImport(name),
          AccountFormat.Base64Json,
          {
            encryptWith: { kind: 'MultisigIdentity', identity },
          },
        )

        await expect(
          routeTest.client.wallet.importAccount({
            name,
            account: base64,
            rescan: false,
          }),
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

        await routeTest.client.wallet.multisig.createParticipant({ name })
        const encryptingParticipant = multisig.ParticipantSecret.random().toIdentity()
        const base64 = encodeAccountImport(
          createAccountImport(name),
          AccountFormat.Base64Json,
          {
            encryptWith: { kind: 'MultisigIdentity', identity: encryptingParticipant },
          },
        )

        await expect(
          routeTest.client.wallet.importAccount({
            name,
            account: base64,
            rescan: false,
          }),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining(
              'Encrypted multisig account cannot be decrypted without a corresponding multisig secret',
            ),
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
          const key = await fs.promises.readFile(path.join(testCaseDir, keyFile), {
            encoding: 'ascii',
          })
          const secret = new multisig.ParticipantSecret(Buffer.from(key, 'hex'))
          const identity = secret.toIdentity()

          await routeTest.node.wallet.walletDb.putMultisigSecret(identity.serialize(), {
            secret: secret.serialize(),
            name: testCaseFile,
          })

          const name = 'new-account-name'
          const response = await routeTest.client.wallet.importAccount({
            account: testCase,
            name,
          })

          expect(response.status).toBe(200)
          expect(response.content.name).toEqual(name)
        }
      })
    })
  })
})
