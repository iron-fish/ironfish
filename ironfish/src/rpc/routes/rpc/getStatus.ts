/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PromiseUtils } from '../../../utils'
import { RpcHttpAdapter, RpcIpcAdapter } from '../../adapters'
import { RpcSocketAdapter } from '../../adapters/socketAdapter/socketAdapter'
import { RpcServer } from '../../server'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type GetRpcStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetRpcStatusResponse = {
  started: boolean
  adapters: {
    name: string
    inbound: number
    outbound: number
    readableBytes: number
    writableBytes: number
    readBytes: number
    writtenBytes: number
    clients: number
    pending: string[]
  }[]
}

export const GetRpcStatusRequestSchema: yup.ObjectSchema<GetRpcStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetRpcStatusResponseSchema: yup.ObjectSchema<GetRpcStatusResponse> = yup
  .object({
    started: yup.boolean().defined(),
    adapters: yup
      .array(
        yup
          .object({
            name: yup.string().defined(),
            inbound: yup.number().defined(),
            outbound: yup.number().defined(),
            readableBytes: yup.number().defined(),
            writableBytes: yup.number().defined(),
            readBytes: yup.number().defined(),
            writtenBytes: yup.number().defined(),
            clients: yup.number().defined(),
            pending: yup.array(yup.string().defined()).defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetRpcStatusRequestSchema, GetRpcStatusResponse>(
  `${ApiNamespace.rpc}/getStatus`,
  GetRpcStatusRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'rpc')

    const jobs = await getRpcStatus(context.rpc)

    if (!request.data?.stream) {
      request.end(jobs)
      return
    }

    request.stream(jobs)

    while (!request.closed) {
      const jobs = await getRpcStatus(context.rpc)
      request.stream(jobs)
      await PromiseUtils.sleep(1000)
    }
  },
)

async function getRpcStatus(rpc: RpcServer): Promise<GetRpcStatusResponse> {
  const result: GetRpcStatusResponse = {
    started: rpc.isRunning,
    adapters: [],
  }

  for (const adapter of rpc.adapters) {
    if (
      !(adapter instanceof RpcIpcAdapter) &&
      !(adapter instanceof RpcSocketAdapter) &&
      !(adapter instanceof RpcHttpAdapter)
    ) {
      continue
    }

    const formatted = {
      name: adapter.constructor.name,
      inbound: 0,
      outbound: 0,
      readableBytes: 0,
      writableBytes: 0,
      readBytes: 0,
      writtenBytes: 0,
      clients: 0,
      pending: new Array<string>(),
    }

    if (adapter instanceof RpcSocketAdapter) {
      for (const client of adapter.clients.values()) {
        formatted.readableBytes += client.socket.readableLength
        formatted.writableBytes += client.socket.writableLength
        formatted.readBytes += client.socket.bytesRead
        formatted.writtenBytes += client.socket.bytesWritten
        client.requests.forEach((r) => formatted.pending.push(r.route))
      }

      formatted.inbound = Math.max(adapter.inboundTraffic.rate1s, 0)
      formatted.outbound = Math.max(adapter.outboundTraffic.rate1s, 0)
      formatted.clients = adapter.clients.size
    } else if (adapter instanceof RpcHttpAdapter) {
      formatted.inbound = Math.max(adapter.inboundTraffic.rate1s, 0)
      formatted.outbound = Math.max(adapter.outboundTraffic.rate1s, 0)
      formatted.readBytes = adapter.inboundBytes.value
      formatted.writtenBytes = adapter.outboundBytes.value

      adapter.requests.forEach((r) => {
        const route = adapter.formatRoute(r.req)
        if (route) {
          formatted.pending.push(route)
        }
      })

      if (adapter.server) {
        const [promise, resolve] = PromiseUtils.split<number>()
        adapter.server.getConnections((err, count) => {
          if (err) {
            resolve(0)
            return
          }
          resolve(count)
        })

        formatted.clients = await promise
      }

      // TODO: there is no equivalent of readableLength or writableLength for HTTP.
      // For now, readableLength and writableLength will be set to 0
    }

    result.adapters.push(formatted)
  }

  return result
}
