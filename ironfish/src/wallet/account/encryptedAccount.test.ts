/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../testUtilities/fixtures/account'
import { createNodeTest } from '../../testUtilities/nodeTest'
import { AccountDecryptionFailedError } from '../errors'
import { MasterKey } from '../masterKey'

describe('EncryptedAccount', () => {
  const nodeTest = createNodeTest()

  it('can decrypt an encrypted account', async () => {
    const passphrase = 'foobarbaz'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const masterKey = MasterKey.generate(passphrase)
    await masterKey.unlock(passphrase)

    const encryptedAccount = account.encrypt(masterKey)
    const decryptedAccount = encryptedAccount.decrypt(masterKey)

    expect(account.serialize()).toMatchObject(decryptedAccount.serialize())
  })

  it('throws an error when an invalid passphrase is used', async () => {
    const passphrase = 'foobarbaz'
    const invalidPassphrase = 'fakepassphrase'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const masterKey = MasterKey.generate(passphrase)
    const invalidMasterKey = MasterKey.generate(invalidPassphrase)
    await invalidMasterKey.unlock(passphrase)

    await masterKey.unlock(passphrase)
    const encryptedAccount = account.encrypt(masterKey)

    expect(() => encryptedAccount.decrypt(invalidMasterKey)).toThrow(
      AccountDecryptionFailedError,
    )
  })
})
