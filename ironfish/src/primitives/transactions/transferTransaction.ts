import bufio from 'bufio'
import { Transaction, TransactionType } from "./transaction";
import { ENCRYPTED_NOTE_LENGTH, NoteEncrypted } from '../noteEncrypted'
import { Spend } from '../spend';
import { TransactionPosted } from '@ironfish/rust-nodejs';
import { blake3 } from '@napi-rs/blake-hash'

export class TransferTransaction extends Transaction {
  readonly expirationSequence: number
  readonly fee: BigInt
  readonly notes: NoteEncrypted[]
  readonly signature: Buffer
  readonly spends: Spend[]

  readonly serializedTransaction: Buffer
  private _hash?: Buffer
  private referenceCount = 0
  private transactionPosted: TransactionPosted | null

  constructor(serializedTransaction: Buffer) {
    super(TransactionType.Transfer)

    this.serializedTransaction = serializedTransaction
    this.transactionPosted = null
    const reader = bufio.read(this.serializedTransaction, true)

    const spendsLength = reader.readU64()
    const notesLength = reader.readU64()
    this.fee = BigInt(reader.readI64()) 
    this.expirationSequence = reader.readU32()

    this.spends = Array.from({ length: spendsLength }, () => {
      // proof
      reader.seek(192)
      // value commitment
      reader.seek(32)
      // randomized public key
      reader.seek(32)

      const rootHash = reader.readHash() // 32
      const treeSize = reader.readU32() // 4
      const nullifier = reader.readHash() // 32

      // signature
      reader.seek(64)

      // total serialized size: 192 + 32 + 32 + 32 + 4 + 32 + 64 = 388 bytes
      return {
        size: treeSize,
        commitment: rootHash,
        nullifier,
      }
    })

    this.notes = Array.from({ length: notesLength }, () => {
      // proof
      reader.seek(192)

      return new NoteEncrypted(reader.readBytes(ENCRYPTED_NOTE_LENGTH, true))
    })

    this.signature = reader.readBytes(64, true)
  }

  serialize(): Buffer {
    return this.serializedTransaction
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): TransactionPosted {
    this.referenceCount++
    if (this.transactionPosted === null) {
      this.transactionPosted = new TransactionPosted(this.serializedTransaction)
    }
    return this.transactionPosted
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.transactionPosted = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: TransactionPosted) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }
  
  /**
   * The number of notes in the transaction.
   */
  notesLength(): number {
    return this.notes.length
  }

  getNote(index: number): NoteEncrypted {
    return this.notes[index]
  }

  /**
   * The number of spends in the transaction.
   */
  spendsLength(): number {
    return this.spends.length
  }

  getSpend(index: number): Spend {
    return this.spends[index]
  }

  /**
   * Get the transaction hash that does not include the signature. This is the hash that
   * is signed when the transaction is created
   */
  unsignedHash(): Buffer {
    return this.withReference((t) => t.hash())
  }

  /**
   * Genereate the hash of a transaction that includes the witness (signature) data.
   * Used for cases where a signature needs to be commited to in the hash like P2P transaction gossip
   */
  hash(): Buffer {
    this._hash = this._hash || blake3(this.serializedTransaction)
    return this._hash
  }
}
