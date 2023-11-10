/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest } from '../testUtilities'

describe('RpcServer', () => {
  const nodeTest = createNodeTest()

  it('should authenticate', () => {
    nodeTest.node.rpc.internal.set('rpcAuthToken', 'ironfish')
    expect(nodeTest.node.rpc.authenticate('ironfish')).toBe(true)
    expect(nodeTest.node.rpc.authenticate('')).toBe(false)
    expect(nodeTest.node.rpc.authenticate('foobar')).toBe(false)
  })

  it('should generate auth when started', async () => {
    // token should be empty
    expect(nodeTest.node.rpc.internal.get('rpcAuthToken')).toEqual('')
    expect(nodeTest.node.rpc.authenticate('')).toBe(false)

    // token should be generated
    await nodeTest.node.rpc.start()
    expect(nodeTest.node.rpc.internal.get('rpcAuthToken')).not.toEqual('')
    expect(nodeTest.node.rpc.authenticate('')).toBe(false)

    // should be able to auth with generated token
    const token = nodeTest.node.rpc.internal.get('rpcAuthToken')
    expect(nodeTest.node.rpc.authenticate(token)).toBe(true)
  })
})
