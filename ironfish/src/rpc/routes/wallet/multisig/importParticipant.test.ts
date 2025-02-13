/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../assert'
import { createRouteTest } from '../../../../testUtilities/routeTest'

describe('Route wallet/multisig/importParticipant', () => {
  const routeTest = createRouteTest()

  it('should fail for an identity that exists', async () => {
    const name = 'name'

    const secret = multisig.ParticipantSecret.random()
    const identity = secret.toIdentity()

    await routeTest.wallet.walletDb.putMultisigIdentity(identity.serialize(), {
      name,
      secret: undefined,
    })

    await expect(
      routeTest.client.wallet.multisig.importParticipant({
        identity: identity.serialize().toString('hex'),
        name: 'new-name',
        secret: secret.serialize().toString('hex'),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Multisig identity ${identity.serialize().toString('hex')} already exists`,
        ),
        status: 400,
      }),
    )
  })
  it('should fail for a participant name that exists', async () => {
    const name = 'name'

    const secret = multisig.ParticipantSecret.random()
    const identity = secret.toIdentity()

    await routeTest.wallet.walletDb.putMultisigIdentity(identity.serialize(), {
      name,
      secret: undefined,
    })

    const newSecret = multisig.ParticipantSecret.random()
    const newIdentity = newSecret.toIdentity()

    await expect(
      routeTest.client.wallet.multisig.importParticipant({
        identity: newIdentity.serialize().toString('hex'),
        name,
        secret: newSecret.serialize().toString('hex'),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Multisig identity already exists with the name ${name}`,
        ),
        status: 400,
      }),
    )
  })

  it('should fail for an account name that exists', async () => {
    const name = 'existing-account'
    await routeTest.client.wallet.createAccount({ name })

    const secret = multisig.ParticipantSecret.random()
    const identity = secret.toIdentity()

    await expect(
      routeTest.client.wallet.multisig.importParticipant({
        identity: identity.serialize().toString('hex'),
        name,
        secret: secret.serialize().toString('hex'),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`Account already exists with the name ${name}`),
        status: 400,
      }),
    )
  })

  it('should import a new identity', async () => {
    const name = 'identity'

    const secret = multisig.ParticipantSecret.random()
    const identity = secret.toIdentity()

    await routeTest.client.wallet.multisig.importParticipant({
      identity: identity.serialize().toString('hex'),
      name,
      secret: secret.serialize().toString('hex'),
    })

    const secretValue = await routeTest.node.wallet.walletDb.getMultisigIdentity(
      identity.serialize(),
    )
    Assert.isNotUndefined(secretValue)
    expect(secretValue.name).toEqual(name)
  })
})
