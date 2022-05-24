/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '../../logger'
import { YupUtils } from '../../utils'
import { IncomingNodeIpcSchema } from '../adapters'
import { IronfishTcpClient } from './tcpClient'

jest.mock('net')

describe('IronfishTcpClient', () => {
  const testHost = 'testhost'
  const testPort = 1234
  const client: IronfishTcpClient = new IronfishTcpClient(
    testHost,
    testPort,
    createRootLogger().withTag('tcpclienttest'),
  )

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should connect and disconnect', () => {
    void client.connect()
    expect(client.client.connect).toHaveBeenCalledWith(testPort, testHost)

    client.close()
    expect(client.client.end).toHaveBeenCalled()
  })

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
      }) + '\f'

    const result = await YupUtils.tryValidate(IncomingNodeIpcSchema, expectedMessage.trim())
    expect(result.error).toBe(null)

    client.request(route)
    expect(client.client.write).toHaveBeenLastCalledWith(expectedMessage)
  })
})
