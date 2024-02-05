/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { Base64JsonEncoder } from '../../../wallet/account/encoder/base64json'
import { AccountFormat } from '../../../wallet/account/encoder/encoder'
import { JsonEncoder } from '../../../wallet/account/encoder/json'
import { MnemonicEncoder } from '../../../wallet/account/encoder/mnemonic'
import { SpendingKeyEncoder } from '../../../wallet/account/encoder/spendingKey'
import { ExportAccountResponse } from './exportAccount'

describe('Route wallet/exportAccount', () => {
  const routeTest = createRouteTest(true)

  let account: Account

  beforeAll(async () => {
    account = await useAccountFixture(routeTest.node.wallet)
  })

  it('should export a default account', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        viewOnly: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        spendingKey: account.spendingKey,
        viewKey: account.viewKey,
        incomingViewKey: account.incomingViewKey,
        outgoingViewKey: account.outgoingViewKey,
        publicAddress: account.publicAddress,
        version: account.version,
      },
    })
  })

  it('should omit spending key when view only account is requested', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        viewOnly: true,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        spendingKey: null,
        viewKey: account.viewKey,
        incomingViewKey: account.incomingViewKey,
        outgoingViewKey: account.outgoingViewKey,
        publicAddress: account.publicAddress,
        version: account.version,
      },
    })
  })

  it('should export an account as a json string if requested', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        format: AccountFormat.JSON,
      })
      .waitForEnd()

    expect(response.status).toBe(200)

    const { id: _, ...accountImport } = account.serialize()
    expect(response.content.account).toEqual(new JsonEncoder().encode(accountImport))
  })

  it('should export an account as a base64 string if requested', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        format: AccountFormat.Base64Json,
      })
      .waitForEnd()

    const { id: _, ...accountImport } = account.serialize()

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new Base64JsonEncoder().encode(accountImport))
  })

  it('should export an account as a spending key string if requested', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        format: AccountFormat.SpendingKey,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new SpendingKeyEncoder().encode(account))
  })

  it('should return an error when exporting a view only account in the spending key format', async () => {
    await expect(() =>
      routeTest.client
        .request<ExportAccountResponse>('wallet/exportAccount', {
          account: account.name,
          format: AccountFormat.SpendingKey,
          viewOnly: true,
        })
        .waitForEnd(),
    ).rejects.toThrow()
  })

  it('should export an account as a mnemonic phrase string if requested', async () => {
    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: account.name,
        format: AccountFormat.Mnemonic,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(new MnemonicEncoder().encode(account, {}))
  })

  it('should return an error when exporting a view only account in the mnemonic format', async () => {
    await expect(() =>
      routeTest.client
        .request<ExportAccountResponse>('wallet/exportAccount', {
          account: account.name,
          format: AccountFormat.Mnemonic,
          viewOnly: true,
        })
        .waitForEnd(),
    ).rejects.toThrow()
  })

  it('should export an account with multiSigKeys', async () => {
    const key = generateKey()

    const accountName = 'foo'
    const accountImport = {
      name: accountName,
      viewKey: key.viewKey,
      spendingKey: null,
      publicAddress: key.publicAddress,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      version: 1,
      createdAt: null,
      multiSigKeys: {
        publicKeyPackage: 'aaaa',
        identifier: 'aaaa',
        keyPackage: 'bbbb',
      },
      proofAuthorizingKey: key.proofAuthorizingKey,
    }

    await routeTest.wallet.importAccount({ ...accountImport, id: uuid() })

    const response = await routeTest.client
      .request<ExportAccountResponse>('wallet/exportAccount', {
        account: accountName,
        viewOnly: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: accountImport.name,
        spendingKey: accountImport.spendingKey,
        viewKey: accountImport.viewKey,
        incomingViewKey: accountImport.incomingViewKey,
        outgoingViewKey: accountImport.outgoingViewKey,
        publicAddress: accountImport.publicAddress,
        version: accountImport.version,
        multiSigKeys: accountImport.multiSigKeys,
      },
    })
  })
})
