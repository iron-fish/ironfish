/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { YupUtils } from '../../utils'
import { IncomingNodeIpcSchema, ValidationError } from '../adapters'
import { IronfishTcpClient } from './tcpClient'

jest.mock('net')

describe('IronfishTcpClient', () => {
    const testHost = 'testhost'
    const testPort = 1234
    const client: IronfishTcpClient = new IronfishTcpClient(
        testHost,
        testPort
    )

    afterEach(() => {
        jest.resetAllMocks()
    })

    it('should connect and disconnect', async () => {
        client.connect()
        expect(client.client.connect).toHaveBeenCalledWith(testPort, testHost)

        client.close()
        expect(client.client.end).toHaveBeenCalled()
    })

    it('should send messages in the node-ipc encoding', async () => {
        const messageId = 1
        const route = 'foo/bar'

        const expectedMessage = JSON.stringify({
            type: 'message',
            data: {
                mid: messageId,
                type: route,
            }
        }) + '\f'

        const result = await YupUtils.tryValidate(IncomingNodeIpcSchema, expectedMessage.trim())
        expect(result.error).toBe(null)

        client.request(route)
        expect(client.client.write).toHaveBeenLastCalledWith(expectedMessage)
    })

    it('should handle message responses', async () => {
        expect.assertions(1)

        // @ts-ignore
        let spyOnMessage = jest.spyOn(client, 'onMessage')

        const testMessageResponse = {
            type: 'message',
            data: {
                id: 0,
                status: 200,
                data: {}
            }
        }

        // @ts-ignore
        await client.onData(Buffer.from(JSON.stringify(testMessageResponse), 'utf-8'))

        expect(spyOnMessage).toHaveBeenCalled()
    })

    it('should handle stream responses', async () => {
        expect.assertions(1)

        // @ts-ignore
        let spyOnStream = jest.spyOn(client, 'onStream')

        const testStreamResponse = {
            type: 'stream',
            data: {
                id: 0,
                data: {}
            }
        }

        // @ts-ignore
        await client.onData(Buffer.from(JSON.stringify(testStreamResponse), 'utf-8'))

        expect(spyOnStream).toHaveBeenCalled()
    })

    it('should handle errors', async () => {
        expect.assertions(1)

        // @ts-ignore
        let spyOnError = jest.spyOn(client, 'onError')

        // @ts-ignore
        await client.onData(Buffer.from(JSON.stringify({type: 'error', data: {}}), 'utf-8'))

        expect(spyOnError).toHaveBeenCalledTimes(1)
    })

    it('should handle responses from malformed requests', async () => {
        expect.assertions(1)

        // @ts-ignore
        let spyOnError = jest.spyOn(client, 'onError')


        // @ts-ignore
        await client.onData(Buffer.from(JSON.stringify({type: 'malformedRequest', data: {}}), 'utf-8'))

        expect(spyOnError).toHaveBeenCalledTimes(1)
    })

    it('should handle invalid responses', async () => {
        expect.assertions(1)

        try {
            // @ts-ignore
            await client.onData(Buffer.from(JSON.stringify({valid: false, data: {}}), 'utf-8'))
        } catch(e) {
            expect(e).toEqual(new ValidationError('type is a required field'))
        }
    })
})