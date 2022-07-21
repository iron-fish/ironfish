import { Transaction, TransactionType } from "./transaction";

export class MinersFeeTransaction extends Transaction {
  private readonly serializedTransaction: Buffer

  constructor(serializedTransaction: Buffer) {
    super(TransactionType.MinersFee)
    this.serializedTransaction = serializedTransaction
  }

  serialize(): Buffer {
    return this.serializedTransaction
  }
}
