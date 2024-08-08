/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { encrypt } from '@ironfish/rust-nodejs'
import { useAccountFixture } from '../../testUtilities/fixtures/account'
import { createNodeTest } from '../../testUtilities/nodeTest'
import { AccountValueEncoding } from '../walletdb/accountValue'
import { EncryptedAccount } from './encryptedAccount'

describe('EncryptedAccount', () => {
  const nodeTest = createNodeTest()

  it('can decrypt an encrypted account', async () => {
    const passphrase = 'foobarbaz'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const encoder = new AccountValueEncoding()
    const data = encoder.serialize(account.serialize())

    const encryptedData = encrypt(data, passphrase)
    const encryptedAccount = new EncryptedAccount({
      data: encryptedData,
      walletDb: node.wallet.walletDb,
    })

    const decryptedAccount = encryptedAccount.decrypt(passphrase)
    const decryptedData = encoder.serialize(decryptedAccount.serialize())
    expect(data.toString('hex')).toEqual(decryptedData.toString('hex'))
  })

  it('throws an error when an invalid passphrase is used', async () => {
    const passphrase = 'foobarbaz'
    const invalidPassphrase = 'fakepassphrase'
    const { node } = nodeTest
    const account = await useAccountFixture(node.wallet)

    const encoder = new AccountValueEncoding()
    const data = encoder.serialize(account.serialize())

    const encryptedData = encrypt(data, passphrase)
    const encryptedAccount = new EncryptedAccount({
      data: encryptedData,
      walletDb: node.wallet.walletDb,
    })

    expect(() => encryptedAccount.decrypt(invalidPassphrase)).toThrow()
  })
})
