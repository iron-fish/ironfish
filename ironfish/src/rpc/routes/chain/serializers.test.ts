/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createNodeTest } from '../../../testUtilities/nodeTest'
import { serializeRpcTransaction } from './serializers'

describe('Rpc Chain Serializers', () => {
  const nodeTest = createNodeTest()

  it('should optionally return serialized', async () => {
    const transaction = await useMinersTxFixture(nodeTest.node)

    // Should include serialized formats
    let serialized = serializeRpcTransaction(transaction, true)
    expect(serialized.serialized).toBe(transaction.serialize().toString('hex'))
    expect(serialized.notes[0].serialized).toBe(
      transaction.notes[0].serialize().toString('hex'),
    )

    // Now should not include them
    serialized = serializeRpcTransaction(transaction, false)
    expect(serialized.serialized).not.toBeDefined()
    expect(serialized.notes[0].serialized).not.toBeDefined()
  })
})
