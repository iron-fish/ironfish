/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../../assert'
import { createRouteTest } from '../../../../testUtilities/routeTest'

describe('Route wallet/multisig/createParticipant', () => {
  const routeTest = createRouteTest()

  it('should fail for a secret name that exists', async () => {
    const name = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name })

    await expect(
      routeTest.client.wallet.multisig.createParticipant({
        name,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Multisig secret already exists with the name ${name}`,
        ),
        status: 400,
      }),
    )
  })

  it('should fail for an account name that exists', async () => {
    const name = 'existing-account'
    await routeTest.client.wallet.createAccount({ name })

    await expect(
      routeTest.client.wallet.multisig.createParticipant({
        name,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`Account already exists with the name ${name}`),
        status: 400,
      }),
    )
  })

  it('should create a secret for a new identity', async () => {
    const name = 'identity'
    const response = await routeTest.client.wallet.multisig.createParticipant({ name })

    const secretValue = await routeTest.node.wallet.walletDb.getMultisigIdentity(
      Buffer.from(response.content.identity, 'hex'),
    )
    Assert.isNotUndefined(secretValue)
    expect(secretValue.name).toEqual(name)
  })
})
