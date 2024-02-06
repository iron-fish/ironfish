/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'

describe('Route multisig/createSignatureShare', () => {
  const routeTest = createRouteTest()

  it('should fail for an account that does not exist', async () => {
    await expect(
      routeTest.client.wallet.multisig.createSignatureShare({
        account: 'non-existent',
        signingPackage: 'fake',
        unsignedTransaction: 'deadbeef',
        seed: 420,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('No account with name'),
        status: 400,
      }),
    )
  })

  it('should fail for an account that does not have multisig keys', async () => {
    const key = generateKey()

    const accountImport = {
      ...key,
      id: '1',
      name: 'fake coordinator',
      version: ACCOUNT_SCHEMA_VERSION,
      spendingKey: null,
      createdAt: null,
      multiSigKeys: { publicKeyPackage: 'abcd' },
    }

    const account = await routeTest.wallet.importAccount(accountImport)

    await expect(
      routeTest.client.wallet.multisig.createSignatureShare({
        account: account.name,
        signingPackage: 'fake',
        unsignedTransaction: 'deadbeef',
        seed: 420,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 400,
      }),
    )
  })
})
