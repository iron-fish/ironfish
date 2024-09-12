/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { AccountFormat } from '../../../wallet/exporter/account'
import { toAccountImport } from '../../../wallet/exporter/accountImport'
import { Base64JsonEncoder } from '../../../wallet/exporter/encoders/base64json'
import { JsonEncoder } from '../../../wallet/exporter/encoders/json'
import { MnemonicEncoder } from '../../../wallet/exporter/encoders/mnemonic'
import { SpendingKeyEncoder } from '../../../wallet/exporter/encoders/spendingKey'

describe('Route wallet/exportAccount', () => {
  const routeTest = createRouteTest(true)

  let account: Account

  beforeAll(async () => {
    account = await useAccountFixture(routeTest.node.wallet)
  })

  it('should export a default account', async () => {
    await routeTest.wallet.setDefaultAccount(account.name)

    const response = await routeTest.client.wallet.exportAccount({
      viewOnly: false,
      format: AccountFormat.SpendingKey,
    })

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new SpendingKeyEncoder().encode(account))
  })

  it('should omit spending key when view only account is requested', async () => {
    const response = await routeTest.client.wallet.exportAccount({
      account: account.name,
      viewOnly: true,
      format: AccountFormat.JSON,
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.content.account)).toMatchObject({
      name: account.name,
      spendingKey: null,
      viewKey: account.viewKey,
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      publicAddress: account.publicAddress,
      version: account.version,
    })
  })

  it('should export an account as a json string if requested', async () => {
    const response = await routeTest.client.wallet.exportAccount({
      account: account.name,
      format: AccountFormat.JSON,
    })

    expect(response.status).toBe(200)

    const accountImport = toAccountImport(account, false, routeTest.wallet.networkId)
    expect(response.content.account).toEqual(new JsonEncoder().encode(accountImport))
  })

  it('should export an account as a base64 string if requested', async () => {
    const response = await routeTest.client.wallet.exportAccount({
      account: account.name,
      format: AccountFormat.Base64Json,
    })

    const accountImport = toAccountImport(account, false, routeTest.wallet.networkId)

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new Base64JsonEncoder().encode(accountImport))
  })

  it('should export an account as a spending key string if requested', async () => {
    const response = await routeTest.client.wallet.exportAccount({
      account: account.name,
      format: AccountFormat.SpendingKey,
    })

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new SpendingKeyEncoder().encode(account))
  })

  it('should return an error when exporting a view only account in the spending key format', async () => {
    await expect(() =>
      routeTest.client.wallet.exportAccount({
        account: account.name,
        format: AccountFormat.SpendingKey,
        viewOnly: true,
      }),
    ).rejects.toThrow()
  })

  it('should export an account as a mnemonic phrase string if requested', async () => {
    const response = await routeTest.client.wallet.exportAccount({
      account: account.name,
      format: AccountFormat.Mnemonic,
    })

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new MnemonicEncoder().encode(account, {}))
  })

  it('should return an error when exporting a view only account in the mnemonic format', async () => {
    await expect(() =>
      routeTest.client.wallet.exportAccount({
        account: account.name,
        format: AccountFormat.Mnemonic,
        viewOnly: true,
      }),
    ).rejects.toThrow()
  })

  it('should export an account with multisigKeys', async () => {
    const accountNames = Array.from({ length: 2 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(
        async (name) =>
          (
            await routeTest.client.wallet.multisig.createParticipant({ name })
          ).content,
      ),
    )

    const multisigIdentity = await routeTest.node.wallet.walletDb.getMultisigIdentity(
      Buffer.from(participants[0].identity, 'hex'),
    )
    Assert.isNotUndefined(multisigIdentity)

    // Initialize the group though TDK and import one of the accounts generated
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants,
      })
    ).content

    const importAccount = trustedDealerPackage.participantAccounts.find(
      ({ identity }) => identity === participants[0].identity,
    )
    expect(importAccount).toBeDefined()

    await routeTest.client.wallet.importAccount({
      name: accountNames[0],
      account: importAccount!.account,
    })

    const response = await routeTest.client.wallet.exportAccount({
      account: accountNames[0],
      viewOnly: false,
      format: AccountFormat.JSON,
    })

    expect(response.status).toBe(200)

    Assert.isNotUndefined(multisigIdentity.secret)

    expect(JSON.parse(response.content.account)).toMatchObject({
      name: accountNames[0],
      spendingKey: null,
      viewKey: trustedDealerPackage.viewKey,
      incomingViewKey: trustedDealerPackage.incomingViewKey,
      outgoingViewKey: trustedDealerPackage.outgoingViewKey,
      publicAddress: trustedDealerPackage.publicAddress,
      multisigKeys: {
        secret: multisigIdentity.secret.toString('hex'),
        publicKeyPackage: trustedDealerPackage.publicKeyPackage,
      },
    })
  })

  it('should export an account with multisigKeys and without multisig secrets when view only account is requested', async () => {
    const accountNames = Array.from(
      { length: 2 },
      (_, index) => `another-test-account-${index}`,
    )
    const participants = await Promise.all(
      accountNames.map(
        async (name) =>
          (
            await routeTest.client.wallet.multisig.createParticipant({ name })
          ).content,
      ),
    )

    const multisigIdentity = await routeTest.node.wallet.walletDb.getMultisigIdentity(
      Buffer.from(participants[0].identity, 'hex'),
    )
    Assert.isNotUndefined(multisigIdentity)

    // Initialize the group though TDK and import one of the accounts generated
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants,
      })
    ).content

    const importAccount = trustedDealerPackage.participantAccounts.find(
      ({ identity }) => identity === participants[0].identity,
    )
    expect(importAccount).toBeDefined()

    await routeTest.client.wallet.importAccount({
      name: accountNames[0],
      account: importAccount!.account,
    })

    const response = await routeTest.client.wallet.exportAccount({
      account: accountNames[0],
      viewOnly: false,
      format: AccountFormat.JSON,
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.content.account)).toMatchObject({
      name: accountNames[0],
      spendingKey: null,
      viewKey: trustedDealerPackage.viewKey,
      incomingViewKey: trustedDealerPackage.incomingViewKey,
      outgoingViewKey: trustedDealerPackage.outgoingViewKey,
      publicAddress: trustedDealerPackage.publicAddress,
      multisigKeys: {
        publicKeyPackage: trustedDealerPackage.publicKeyPackage,
      },
    })
  })
})
