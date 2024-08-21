/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { YupSchema, YupSchemaResult } from '../../../utils/yup'
import { RpcRequest } from '../../request'
import { ApiNamespace } from '../namespaces'
import { RouteHandler, routes } from '../router'

export type EthRequest = {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params: unknown[]
}

export type EthResponse = unknown

function createSchema<M extends string>(schema: yup.Schema<unknown>) {
  return yup
    .object({
      jsonrpc: yup.string<'2.0'>().required(),
      id: yup.mixed<number | string>().required(),
      method: yup.string<M>().required(),
      params: yup.array(schema).required(),
    })
    .defined()
}

export const ethRoutes: {
  [key: string]: {
    schema: yup.Schema<unknown>
    handler: RouteHandler<YupSchemaResult<never>, unknown>
  }
} = {}

export function registerEthRoute<TRequestSchema extends YupSchema, TResponse>(
  ethRoute: string,
  route: string,
  requestSchema: TRequestSchema,
  handler: RouteHandler<YupSchemaResult<TRequestSchema>, TResponse>,
): void {
  ethRoutes[ethRoute] = {
    schema: createSchema(requestSchema),
    handler: handler,
  }
  routes.register(route, requestSchema, handler)
}

export const RouterRequestSchema: yup.MixedSchema<EthRequest> = yup
  .mixed<EthRequest>()
  .test('method-not-in-request', 'Invalid Request', (value) =>
    'method' in value ? true : false,
  )
  .test('method-not-registers', 'Method not registered', (value) =>
    ethRoutes[(value as { method: string }).method] ? true : false,
  )
  .test('is-valid-request', 'Invalid Request', (value) => {
    return value
      ? ethRoutes[(value as { method: string }).method].schema.isValidSync(value)
      : false
  })
  .defined()

routes.register<typeof RouterRequestSchema, EthResponse>(
  `${ApiNamespace.eth}/ethRouter`,
  RouterRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const handlerEntry = ethRoutes[request.data.method]

    if (handlerEntry) {
      const req = new RpcRequest<typeof request.data.params[0], EthResponse>(
        request.data.params[0],
        '',
        request.onEnd as (status: number, data?: unknown) => void,
        request.onStream as (data: unknown) => void,
      )
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      await handlerEntry.handler(req as unknown as any, node)
    } else {
      throw new Error(`Unsupported method: ${request.data.method}`)
    }
  },
)
