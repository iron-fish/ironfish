/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { YupUtils } from '../../utils'
import { ClientSocketRpcSchema, MESSAGE_DELIMITER } from '../adapters/socketAdapter/protocol'
import { RpcTcpClient } from './tcpClient'

jest.mock('net')

describe('IronfishTcpClient', () => {
  const testHost = 'testhost'
  const testPort = 1234
  const client: RpcTcpClient = new RpcTcpClient(testHost, testPort)

  it('should send messages in the node-ipc encoding', async () => {
    const messageId = 1
    const route = 'foo/bar'

    const expectedMessage =
      JSON.stringify({
        type: 'message',
        data: {
          mid: messageId,
          type: route,
        },
      }) + MESSAGE_DELIMITER

    const result = await YupUtils.tryValidate(ClientSocketRpcSchema, expectedMessage.trim())
    expect(result.error).toBe(null)

    client.client = new net.Socket()

    client.request(route)
    expect(client.client.write).toHaveBeenLastCalledWith(expectedMessage)
  })
})
