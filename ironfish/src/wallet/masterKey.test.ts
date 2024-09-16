/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MasterKey } from './masterKey'

describe('MasterKey', () => {
  it('can regenerate the master key from parts', async () => {
    const passphrase = 'foobar'
    const masterKey = MasterKey.generate(passphrase)
    const duplicate = new MasterKey({ nonce: masterKey.nonce, salt: masterKey.salt })

    const key = await masterKey.unlock(passphrase)
    const reconstructed = await duplicate.unlock(passphrase)
    expect(key.key().equals(reconstructed.key())).toBe(true)
  })

  it('can regenerate the child key from parts', async () => {
    const passphrase = 'foobar'
    const masterKey = MasterKey.generate(passphrase)
    await masterKey.unlock(passphrase)

    const childKey = masterKey.deriveNewKey()
    const duplicate = masterKey.deriveKey(childKey.salt(), childKey.nonce())
    expect(childKey.key().equals(duplicate.key())).toBe(true)
  })

  it('can save and remove the xchacha20poly1305 in memory', async () => {
    const passphrase = 'foobar'
    const masterKey = MasterKey.generate(passphrase)

    await masterKey.unlock(passphrase)
    expect(masterKey['masterKey']).not.toBeNull()

    await masterKey.lock()
    expect(masterKey['masterKey']).toBeNull()
  })
})
