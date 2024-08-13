/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../testUtilities/fixtures/account'
import { createNodeTest } from '../../testUtilities/nodeTest'
import { AccountDecryptionFailedError } from '../errors'

describe('EncryptedAccount', () => {
  const nodeTest = createNodeTest()

  it('can decrypt an encrypted account', async () => {
    const passphrase = 'foobarbaz'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const encryptedAccount = account.encrypt(passphrase)
    const decryptedAccount = encryptedAccount.decrypt(passphrase)

    expect(decryptedAccount.serialize()).toEqual(account.serialize())
  })

  it('throws an error when an invalid passphrase is used', async () => {
    const passphrase = 'foobarbaz'
    const invalidPassphrase = 'fakepassphrase'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const encryptedAccount = account.encrypt(passphrase)

    expect(() => encryptedAccount.decrypt(invalidPassphrase)).toThrow(
      AccountDecryptionFailedError,
    )
  })
})
