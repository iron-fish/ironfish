/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NoteEncrypted, TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface UnspentNote {
  account: string
  hash: string
  note: Buffer
}

export class GetUnspentNotesRequest extends WorkerMessage {
  readonly serializedTransactionPosted: Buffer
  readonly accountIncomingViewKeys: string[]

  constructor(
    serializedTransactionPosted: Buffer,
    accountIncomingViewKeys: string[],
    jobId?: number,
  ) {
    super(WorkerMessageType.GetUnspentNotes, jobId)
    this.serializedTransactionPosted = serializedTransactionPosted
    this.accountIncomingViewKeys = accountIncomingViewKeys
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU64(this.accountIncomingViewKeys.length)
    for (const incomingViewKey of this.accountIncomingViewKeys) {
      bw.writeVarString(incomingViewKey)
    }

    bw.writeVarBytes(this.serializedTransactionPosted)
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): GetUnspentNotesRequest {
    const reader = bufio.read(buffer, true)

    const accountIncomingViewKeys = []
    const accountsLength = reader.readU64()
    for (let i = 0; i < accountsLength; i++) {
      accountIncomingViewKeys.push(reader.readVarString())
    }

    const serializedTransactionPosted = reader.readVarBytes()
    return new GetUnspentNotesRequest(
      serializedTransactionPosted,
      accountIncomingViewKeys,
      jobId,
    )
  }

  getSize(): number {
    let size = 8
    for (const incomingViewKey of this.accountIncomingViewKeys) {
      size += bufio.sizeVarString(incomingViewKey)
    }
    return size + bufio.sizeVarBytes(this.serializedTransactionPosted)
  }
}

export class GetUnspentNotesResponse extends WorkerMessage {
  readonly notes: UnspentNote[]

  constructor(notes: UnspentNote[], jobId: number) {
    super(WorkerMessageType.GetUnspentNotes, jobId)
    this.notes = notes
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.notes.length)
    for (const note of this.notes) {
      bw.writeVarString(note.account, 'utf8')
      bw.writeVarString(note.hash)
      bw.writeVarBytes(note.note)
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): GetUnspentNotesResponse {
    const reader = bufio.read(buffer, true)
    const notes = []

    const notesLength = reader.readU64()
    for (let i = 0; i < notesLength; i++) {
      const account = reader.readVarString('utf8')
      const hash = reader.readVarString()
      const note = reader.readVarBytes()
      notes.push({ account, hash, note })
    }

    return new GetUnspentNotesResponse(notes, jobId)
  }

  getSize(): number {
    let size = 8
    for (const note of this.notes) {
      size += bufio.sizeVarString(note.account, 'utf8')
      size += bufio.sizeVarString(note.hash)
      size += bufio.sizeVarBytes(note.note)
    }
    return size
  }
}

export class GetUnspentNotesTask extends WorkerTask {
  private static instance: GetUnspentNotesTask | undefined

  static getInstance(): GetUnspentNotesTask {
    if (!GetUnspentNotesTask.instance) {
      GetUnspentNotesTask.instance = new GetUnspentNotesTask()
    }
    return GetUnspentNotesTask.instance
  }

  execute({
    accountIncomingViewKeys,
    serializedTransactionPosted,
    jobId,
  }: GetUnspentNotesRequest): GetUnspentNotesResponse {
    const transaction = new TransactionPosted(serializedTransactionPosted)
    const notes = []

    for (let i = 0; i < transaction.notesLength(); i++) {
      const serializedNote = transaction.getNote(i)
      const note = new NoteEncrypted(serializedNote)

      // Notes can be spent and received by the same Account.
      // Try decrypting the note as its owner
      for (const account of accountIncomingViewKeys) {
        const decryptedNote = note.decryptNoteForOwner(account)

        if (decryptedNote) {
          notes.push({
            account,
            hash: note.merkleHash().toString('hex'),
            note: decryptedNote,
          })

          break
        }
      }
    }

    return new GetUnspentNotesResponse(notes, jobId)
  }
}
