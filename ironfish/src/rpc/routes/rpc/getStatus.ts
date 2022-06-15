/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { RpcIpcAdapter } from '../../adapters'
import { RpcSocketAdapter } from '../../adapters/socketAdapter/socketAdapter'
import { ApiNamespace, router } from '../router'

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
    pending: number
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
            pending: yup.number().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetRpcStatusRequestSchema, GetRpcStatusResponse>(
  `${ApiNamespace.rpc}/getStatus`,
  GetRpcStatusRequestSchema,
  (request, node): void => {
    const jobs = getRpcStatus(node)

    if (!request.data?.stream) {
      request.end(jobs)
      return
    }

    request.stream(jobs)

    const interval = setInterval(() => {
      const jobs = getRpcStatus(node)
      request.stream(jobs)
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getRpcStatus(node: IronfishNode): GetRpcStatusResponse {
  const result: GetRpcStatusResponse = {
    started: node.rpc.isRunning,
    adapters: [],
  }

  for (const adapter of node.rpc.adapters) {
    if (!(adapter instanceof RpcIpcAdapter) && !(adapter instanceof RpcSocketAdapter)) {
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
      pending: 0,
    }

    if (adapter instanceof RpcIpcAdapter) {
      if (!adapter.ipc) {
        continue
      }

      for (const socket of adapter.ipc.server.sockets) {
        if (socket instanceof net.Socket) {
          formatted.readableBytes += socket.readableLength
          formatted.writableBytes += socket.writableLength
          formatted.readBytes += socket.bytesRead
          formatted.writtenBytes += socket.bytesWritten
        }
      }

      for (const pending of adapter.pending.values()) {
        formatted.pending += pending.length
      }

      formatted.inbound = Math.max(adapter.inboundTraffic.rate1s, 0)
      formatted.outbound = Math.max(adapter.outboundTraffic.rate1s, 0)
      formatted.clients = adapter.ipc?.server.sockets.length ?? 0
    }

    if (adapter instanceof RpcSocketAdapter) {
      for (const client of adapter.clients.values()) {
        formatted.readableBytes += client.socket.readableLength
        formatted.writableBytes += client.socket.writableLength
        formatted.readBytes += client.socket.bytesRead
        formatted.writtenBytes += client.socket.bytesWritten
        formatted.pending += client.requests.size
      }

      formatted.inbound = Math.max(adapter.inboundTraffic.rate1s, 0)
      formatted.outbound = Math.max(adapter.outboundTraffic.rate1s, 0)
      formatted.clients = adapter.clients.size
    }

    result.adapters.push(formatted)
  }

  return result
}
