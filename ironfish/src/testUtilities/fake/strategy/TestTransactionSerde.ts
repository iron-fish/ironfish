/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Serde, { BufferSerde, IJSON } from '../../../serde'
import { TestTransaction } from './TestTransaction'
import type { SerializedTestTransaction } from './SerializedTypes'

export class TestTransactionSerde implements Serde<TestTransaction, SerializedTestTransaction> {
  equals(transactions1: TestTransaction, transactions2: TestTransaction): boolean {
    return (
      IJSON.stringify(this.serialize(transactions1)) ===
      IJSON.stringify(this.serialize(transactions2))
    )
  }

  serialize(transaction: TestTransaction): SerializedTestTransaction {
    const nullifierSerde = new BufferSerde(32)

    const spends = transaction._spends.map((t) => {
      return { ...t, nullifier: nullifierSerde.serialize(t.nullifier) }
    })
    return {
      elements: transaction.elements,
      spends,
      totalFees: transaction.totalFees.toString(),
      isValid: transaction.isValid,
    }
  }

  deserialize(data: SerializedTestTransaction): TestTransaction {
    const nullifierSerde = new BufferSerde(32)
    const spends: TestTransaction['_spends'] = data.spends.map((s) => {
      return {
        commitment: s.commitment,
        size: s.size,
        nullifier: nullifierSerde.deserialize(s.nullifier),
      }
    })
    return new TestTransaction(
      data.isValid,
      data.elements.map(String),
      BigInt(data.totalFees),
      spends,
    )
  }
}
