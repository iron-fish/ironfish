/// <reference types="node" />
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
export declare class Note {
    boxedData: unknown;
    constructor();
    constructor(owner: string, value: bigint, memo: string);
    free(): void;
    static fromBoxedData(boxedData: unknown): Note;
    static deserialize(data: Buffer): Note;
    serialize(): Buffer;
    get value(): bigint;
    get memo(): string;
    nullifier(ownerPrivateKey: string, position: bigint): Buffer;
}
export declare class NoteEncrypted {
    boxedData: unknown;
    constructor(boxedData: unknown);
    free(): void;
    static combineHash(depth: number, left: Buffer, right: Buffer): any;
    static deserialize(data: Buffer): NoteEncrypted;
    serialize(): Buffer;
    equals(noteEncrypted: NoteEncrypted): boolean;
    merkleHash(): Buffer;
    decryptNoteForOwner(owner_hex_key: string): Note | undefined;
    decryptNoteForSpender(spender_hex_key: string): Note | undefined;
}
export declare class SimpleTransaction {
    boxedData: unknown;
    constructor(spenderHexKey: string, intendedTransactionFee: bigint);
    free(): void;
    spend(note: Note, witness: IWitness): string;
    receive(note: Note): string;
    post(): TransactionPosted;
}
export declare class Transaction {
    boxedData: unknown;
    constructor();
    free(): void;
    receive(spenderHexKey: string, note: Note): string;
    spend(spenderHexKey: string, note: Note, witness: IWitness): string;
    post_miners_fee(): TransactionPosted;
    post(spenderHexKey: string, changeGoesTo: string | undefined, intendedTransactionFee: bigint): TransactionPosted;
}
declare class SpendProof {
    boxedData: unknown;
    constructor(boxedData: unknown);
    free(): void;
    get nullifier(): Buffer;
    get rootHash(): Buffer;
    get treeSize(): number;
}
export declare class TransactionPosted {
    boxedData: unknown;
    constructor(boxedData: unknown);
    free(): void;
    static deserialize(bytes: Buffer): TransactionPosted;
    serialize(): Buffer;
    verify(): boolean;
    getNote(index: number): Buffer;
    getSpend(index: number): SpendProof;
    get notesLength(): number;
    get spendsLength(): number;
    get fee(): bigint;
    get hash(): Buffer;
    get transactionSignature(): Buffer;
}
export declare const generateKey: () => Key;
export declare const generateNewPublicAddress: (privateKey: string) => Key;
export {};
//# sourceMappingURL=index.d.ts.map