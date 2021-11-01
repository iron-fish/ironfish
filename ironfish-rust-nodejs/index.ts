import native from './index.node';

export interface Key {
  free(): void;

  readonly incoming_view_key: string;
  
  readonly outgoing_view_key: string;
  
  readonly public_address: string;
  
  readonly spending_key: string;
}

interface IWitnessNode {
  side(): 'Left' | 'Right';
  hashOfSibling(): Uint8Array;
}

interface IWitness {
  verify(myHash: Uint8Array): boolean;
  authPath(): IWitnessNode[];
  treeSize(): number;
  serializeRootHash(): Uint8Array;
}

export class Note {
  boxedData: unknown

  constructor()
  constructor(owner: string, value: bigint, memo: string)
  constructor(owner?: string, value?: bigint, memo?: string) {
    if (arguments.length === 0) {
      return;
    }

    this.boxedData = native.noteNew(owner, value?.toString(), memo);
  }

  free() {}

  static fromBoxedData(boxedData: unknown) {
    const note = new Note();
    note.boxedData = boxedData;
    return note;
  }

  static deserialize(data: Buffer): Note {
    const result = native.noteDeserialize(data);
    return Note.fromBoxedData(result);
  }

  serialize(): Buffer {
    return native.noteSerialize.call(this.boxedData);
  }

  get value(): bigint {
    return BigInt(native.noteValue.call(this.boxedData));
  }

  get memo(): string {
    return native.noteMemo.call(this.boxedData);
  }

  nullifier(ownerPrivateKey: string, position: bigint): Buffer {
    return native.noteNullifier.call(this.boxedData, ownerPrivateKey, position.toString());
  }
}

export class NoteEncrypted {
  boxedData: unknown

  constructor(boxedData: unknown) {
      this.boxedData = boxedData;
  }

  free() {}

  static combineHash(depth: number, left: Buffer, right: Buffer) {
    return native.combineHash(depth, left, right)
  }

  static deserialize(data: Buffer): NoteEncrypted {
    const result = native.noteEncryptedDeserialize(data);
    return new NoteEncrypted(result);
  }

  serialize(): Buffer {
    return native.noteEncryptedSerialize.call(this.boxedData);
  }

  equals(noteEncrypted: NoteEncrypted): boolean {
    return native.noteEncryptedEquals.call(this.boxedData, noteEncrypted.boxedData);
  }

  merkleHash(): Buffer {
    return native.noteEncryptedMerkleHash.call(this.boxedData);
  }

  decryptNoteForOwner(owner_hex_key: string): Note | undefined {
    const boxedData = native.noteEncryptedDecryptNoteForOwner.call(this.boxedData, owner_hex_key);

    return boxedData ? Note.fromBoxedData(boxedData) : undefined;
  }

  decryptNoteForSpender(spender_hex_key: string): Note | undefined {
    const boxedData = native.noteEncryptedDecryptNoteForSpender.call(this.boxedData, spender_hex_key);

    return boxedData ? Note.fromBoxedData(boxedData) : undefined;
  }
}

export class SimpleTransaction {
  boxedData: unknown

  constructor(spenderHexKey: string, intendedTransactionFee: bigint) {
    this.boxedData = native.simpleTransactionNew(spenderHexKey, intendedTransactionFee.toString());
  }

  free() {}

  spend(note: Note, witness: IWitness): string {
    return native.simpleTransactionSpend.call(this.boxedData, note.boxedData, witness);
  }

  receive(note: Note): string {
    return native.simpleTransactionReceive.call(this.boxedData, note.boxedData);
  }

  post(): TransactionPosted {
    return new TransactionPosted(native.simpleTransactionPost.call(this.boxedData));
  }
}

export class Transaction {
  boxedData: unknown

  constructor() {
    this.boxedData = native.transactionNew();
  }

  free() {}

  receive(spenderHexKey: string, note: Note): string {
    return native.transactionReceive.call(this.boxedData, spenderHexKey, note.boxedData);
  }

  spend(spenderHexKey: string, note: Note, witness: IWitness): string {
    return native.transactionSpend.call(this.boxedData, spenderHexKey, note.boxedData, witness);
  }

  post_miners_fee(): TransactionPosted {
    return new TransactionPosted(native.transactionPostMinersFee.call(this.boxedData));
  }

  post(spenderHexKey: string, changeGoesTo: string | undefined, intendedTransactionFee: bigint): TransactionPosted {
    changeGoesTo = changeGoesTo ?? '';

    return new TransactionPosted(native.transactionPost.call(this.boxedData, spenderHexKey, changeGoesTo, intendedTransactionFee.toString()));
  }
}

class SpendProof {
  boxedData: unknown

  constructor(boxedData: unknown) {
    this.boxedData = boxedData;
  }

  free() {}

  get nullifier(): Buffer {
    return native.spendProofNullifier.call(this.boxedData);
  }

  get rootHash(): Buffer {
    return native.spendProofRootHash.call(this.boxedData);
  }

  get treeSize(): number {
    return native.spendProofTreeSize.call(this.boxedData);
  }
}

export class TransactionPosted {
  boxedData: unknown

  constructor(boxedData: unknown) {
    this.boxedData = boxedData;
  }

  free() {}

  static deserialize(bytes: Buffer): TransactionPosted {
    const result = native.transactionPostedDeserialize(bytes);
    return new TransactionPosted(result);
  }

  serialize(): Buffer {
    return native.transactionPostedSerialize.call(this.boxedData);
  }

  verify(): boolean {
    return native.transactionPostedVerify.call(this.boxedData);
  }

  getNote(index: number): Buffer {
    return native.transactionPostedGetNote.call(this.boxedData, index);
  }

  getSpend(index: number): SpendProof {
    const result = native.transactionPostedGetSpend.call(this.boxedData, index);
    return new SpendProof(result);
  }

  get notesLength(): number {
    return native.transactionPostedNotesLength.call(this.boxedData);
  }

  get spendsLength(): number {
    return native.transactionPostedSpendsLength.call(this.boxedData);
  }

  get fee(): bigint {
    const result = native.transactionPostedFee.call(this.boxedData);
    return BigInt(result);
  }

  get hash(): Buffer {
    return native.transactionPostedHash.call(this.boxedData);
  }

  get transactionSignature(): Buffer {
    return native.transactionPostedTransactionSignature.call(this.boxedData);
  }
}

export const generateKey: () => Key = native.generateKey
export const generateNewPublicAddress: (privateKey: string) => Key = native.generateNewPublicAddress
