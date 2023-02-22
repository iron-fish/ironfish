/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import { DECRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Note } from '../../../primitives/note'
import { NoteEncryptedHash } from '../../../primitives/noteEncrypted'
import {
  BufferEncoding,
  IDatabase,
  IDatabaseEncoding,
  IDatabaseStore,
  PrefixEncoding,
  StringEncoding,
} from '../../../storage'
import { Account } from '../../../wallet'

const KEY_LENGTH = 32
const VIEW_KEY_LENGTH = 64
const VERSION_LENGTH = 2

export interface AccountValue {
  version: number
  id: string
  name: string
  spendingKey: string
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
}

export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  serialize(value: AccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeU16(value.version)
    bw.writeVarString(value.id, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    bw.writeBytes(Buffer.from(value.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))
    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const version = reader.readU16()
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    return {
      version,
      id,
      name,
      spendingKey,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      publicAddress,
    }
  }

  getSize(value: AccountValue): number {
    let size = 0
    size += VERSION_LENGTH
    size += bufio.sizeVarString(value.id, 'utf8')
    size += bufio.sizeVarString(value.name, 'utf8')
    size += KEY_LENGTH
    size += VIEW_KEY_LENGTH
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += PUBLIC_ADDRESS_LENGTH

    return size
  }
}

export interface DecryptedNoteValue {
  accountId: string
  note: Note
  spent: boolean
  transactionHash: Buffer
  // These fields are populated once the note's transaction is on the main chain
  index: number | null
  nullifier: Buffer | null
  blockHash: Buffer | null
  sequence: number | null
}

export class DecryptedNoteValueEncoding implements IDatabaseEncoding<DecryptedNoteValue> {
  serialize(value: DecryptedNoteValue): Buffer {
    const { accountId, nullifier, index, note, spent, transactionHash, blockHash, sequence } =
      value
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!index) << 0
    flags |= Number(!!nullifier) << 1
    flags |= Number(spent) << 2
    flags |= Number(!!blockHash) << 3
    flags |= Number(!!sequence) << 4
    bw.writeU8(flags)

    bw.writeVarString(accountId, 'utf8')
    bw.writeBytes(note.serialize())
    bw.writeHash(transactionHash)

    if (index) {
      bw.writeU32(index)
    }
    if (nullifier) {
      bw.writeHash(nullifier)
    }
    if (blockHash) {
      bw.writeHash(blockHash)
    }
    if (sequence) {
      bw.writeU32(sequence)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): DecryptedNoteValue {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const hasIndex = flags & (1 << 0)
    const hasNullifier = flags & (1 << 1)
    const spent = Boolean(flags & (1 << 2))
    const hasBlockHash = flags & (1 << 3)
    const hasSequence = flags & (1 << 4)

    const accountId = reader.readVarString('utf8')
    const serializedNote = reader.readBytes(DECRYPTED_NOTE_LENGTH)
    const transactionHash = reader.readHash()

    let index = null
    if (hasIndex) {
      index = reader.readU32()
    }

    let nullifier = null
    if (hasNullifier) {
      nullifier = reader.readHash()
    }

    let blockHash = null
    if (hasBlockHash) {
      blockHash = reader.readHash()
    }

    let sequence = null
    if (hasSequence) {
      sequence = reader.readU32()
    }

    const note = new Note(serializedNote)

    return {
      accountId,
      index,
      nullifier,
      note,
      spent,
      transactionHash,
      blockHash,
      sequence,
    }
  }

  getSize(value: DecryptedNoteValue): number {
    let size = 1
    size += bufio.sizeVarString(value.accountId)
    size += DECRYPTED_NOTE_LENGTH

    // transaction hash
    size += 32

    if (value.index) {
      size += 4
    }

    if (value.nullifier) {
      size += 32
    }

    if (value.blockHash) {
      size += 32
    }

    if (value.sequence) {
      size += 4
    }

    return size
  }
}

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
  decryptedNotes: IDatabaseStore<{
    key: [Account['prefix'], NoteEncryptedHash]
    value: DecryptedNoteValue
  }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  const decryptedNotes: IDatabaseStore<{
    key: [Account['prefix'], NoteEncryptedHash]
    value: DecryptedNoteValue
  }> = db.addStore({
    name: 'd',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new DecryptedNoteValueEncoding(),
  })

  return { accounts, decryptedNotes }
}
