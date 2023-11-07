/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest } from '../testUtilities'

describe('RpcServer', () => {
  const nodeTest = createNodeTest()

  it('should authentiacte', () => {
    nodeTest.node.rpc.internal.set('rpcAuthToken', 'foo')
    expect(nodeTest.node.rpc.authenticate('')).toBe(false)
    expect(nodeTest.node.rpc.authenticate('foobar')).toBe(false)
  })
})
