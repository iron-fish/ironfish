/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, LanguageCode, multisig, spendingKeyToWords } from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { createTrustedDealerKeyPackages, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { JsonEncoder } from '../../../wallet'
import {
  decodeAccountImport,
  isMultisigHardwareSignerImport,
  isMultisigSignerImport,
} from '../../../wallet/exporter'
import { AccountFormat, encodeAccountImport } from '../../../wallet/exporter/account'
import { AccountImport } from '../../../wallet/exporter/accountImport'
import { Bech32Encoder } from '../../../wallet/exporter/encoders/bech32'
import { encryptEncodedAccount } from '../../../wallet/exporter/encryption'
import { RPC_ERROR_CODES } from '../../adapters'
import { RpcClient, RpcRequestError } from '../../clients'

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
      ledger: true,
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
    const { dealer: trustedDealerPackages } = createTrustedDealerKeyPackages()

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
      ledger: false,
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
        ledger: false,
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
        ledger: false,
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
        ledger: false,
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
        ledger: false,
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
      const bech32Json =
        'ironfishaccount0000010v38vetjwd5k7m3z8gcjcgnwv9kk2g36yf3x2cmgxvex5um0dc3zcgnkd9jhwjm90y3r5gnz8y6kydpcxumnwd3kxuukzvehvgmrwd35xf3njdpex56k2dfcxquxzd3sxucrgdfsxc6r2dnrxqmkye34xycrwdpexy6k2ct9vsekxvt9vg6rqwtxv9nxvenpx9nrzvryxvmrjcmzvfnrgwf3xyekve3exymkgdmzxqcxvctzvf3rzefsxa3rzvt9xdjr2vpcx3jkzceex5czytpzd9hxxmmdd9hxw4nfv4m5keteygazye3jvsmxxep3vfjnqdtpxejx2dekv43nswtyvymkyc3sv93nvvejv93njdecvcenyef3v4nxzepkv3jnwdfkxp3rjdmpv4skywf4xqezytpzda6hgem0d9hxw4nfv4m5keteygazyvf48yckxdm9xf3xzwtzxvckgcmrx4jrgcfkvcunvwp4v5envvnzx33njc3nx56kywtyxcerqcmpxe3rgefk8ycnjcecxqmr2deevvejytpzwp6kymrfvdqkgerjv4ehxg36ygcrvvtyvvmkxvnxxc6xgwfc8ymx2epkxajxvdpkxumkyctxx43nwwtzvvukgefhvsunvvfexenxyvfex3jnqdrxvd3xgcnyvvek2vecygkzyumsv4hxg6twva9k27fz8g3xzdt9vccnscfkxv6nwc3kxgensdehxanrjvtyvgurjdenxsmrvwtxxvervwrxxyerxetr8pnrvvtzxcukyep3xqckvvr9xy6xgef38q3zcgnswfhk7ejpw46xsmmjd9axjmn8fdjhjg36yf3n2ep5vejnsenpvejx2vp5vdnrwwrrxenrwdp58qmk2dfsxs6nyd34v5cnqvry8yerjwryxpsnwdmyv93ngetrxanrxwfk8qmkgvp4ygkzycmjv4shgetyg96zywnww4kxclg8yxf4p'

      const response = await routeTest.client.wallet.importAccount({
        account: bech32Json,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
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

        await routeTest.client.wallet.removeAccount({ account: testCaseFile })

        const account = decodeAccountImport(testCase, {
          name: testCaseFile,
        })

        if (account.multisigKeys && isMultisigHardwareSignerImport(account.multisigKeys)) {
          await routeTest.node.wallet.walletDb.deleteMultisigIdentity(
            Buffer.from(account.multisigKeys.identity, 'hex'),
          )
        }

        if (account.multisigKeys && isMultisigSignerImport(account.multisigKeys)) {
          await routeTest.node.wallet.walletDb.deleteMultisigIdentity(
            new multisig.ParticipantSecret(Buffer.from(account.multisigKeys.secret, 'hex'))
              .toIdentity()
              .serialize(),
          )
        }
      }
    })

    it('should import an encrypted account', async () => {
      const name = 'multisig-encrypted-base64'

      const identity = await routeTest.wallet.createMultisigSecret(name)
      const account = createAccountImport(name)
      const encoded = encodeAccountImport(account, AccountFormat.JSON)

      const encrypted = encryptEncodedAccount(encoded, {
        kind: 'MultisigIdentity',
        identity: new multisig.ParticipantIdentity(identity),
      })

      const response = await routeTest.client.wallet.importAccount({
        name,
        account: encrypted,
        rescan: false,
      })

      expect(response.status).toBe(200)
      expect(response.content.name).toBe(name)
    })

    it('should import old account export formats', async () => {
      const testCaseSuffix = '.txt'
      const keySuffix = '.key'
      const testCaseDir = path.join(__dirname, '__importTestCases__', 'multisigEncrypted')
      const importTestCaseFiles = fs
        .readdirSync(testCaseDir, { withFileTypes: true })
        .filter(
          (testCaseFile) => testCaseFile.isFile() && testCaseFile.name.endsWith(testCaseSuffix),
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

        await routeTest.node.wallet.walletDb.putMultisigIdentity(identity.serialize(), {
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

  it('should set the account createdAt field to the createdAt sequence', async () => {
    const name = 'createdAtTest'
    const spendingKey = generateKey().spendingKey

    // add block to chain that will serve as the account head
    const block2 = await useMinerBlockFixture(routeTest.node.chain)
    await expect(routeTest.node.chain).toAddBlock(block2)

    const createdAtSequence = 3

    const response = await routeTest.client.wallet.importAccount({
      account: spendingKey,
      name: name,
      rescan: false,
      createdAt: createdAtSequence,
    })

    expect(response.status).toBe(200)
    const account = routeTest.node.wallet.getAccountByName(name)
    expect(account).toBeDefined()
    expect(account?.createdAt?.sequence).toEqual(createdAtSequence)

    const accountHead = await account?.getHead()
    expect(accountHead?.sequence).toEqual(createdAtSequence - 1)
  })

  it('should not import account with duplicate name', async () => {
    const name = 'duplicateNameTest'
    const spendingKey = generateKey().spendingKey

    await routeTest.client.wallet.importAccount({
      account: spendingKey,
      name,
      rescan: false,
    })

    try {
      await routeTest.client.wallet.importAccount({
        account: spendingKey,
        name,
        rescan: false,
      })
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME)
    }

    expect.assertions(2)
  })

  describe('account format', () => {
    it('should decode an account import with the requested format', async () => {
      const name = 'mnemonic-format'
      const mnemonic = spendingKeyToWords(generateKey().spendingKey, LanguageCode.English)

      const response = await routeTest.client.wallet.importAccount({
        account: mnemonic,
        name: name,
        rescan: false,
        format: AccountFormat.Mnemonic,
      })

      expect(response.status).toBe(200)
      expect(response.content).toMatchObject({
        name: name,
      })
    })

    it('should fail to decode an account import with the incorrect format', async () => {
      const name = 'mnemonic-format'
      const mnemonic = spendingKeyToWords(generateKey().spendingKey, LanguageCode.English)

      await expect(
        routeTest.client.wallet.importAccount({
          account: mnemonic,
          name,
          rescan: false,
          format: AccountFormat.JSON,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message:
          expect.not.stringContaining('decoder errors:') &&
          expect.stringContaining('Invalid JSON'),
      })
    })
  })
})
