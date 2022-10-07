/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { RpcIpcAdapter } from '../../adapters'
import { RpcSocketAdapter } from '../../adapters/socketAdapter/socketAdapter'
import { ApiNamespace, router } from '../router'

export type GetRpcMethodsRequest = {
  namespace?: string
}

export type GetRpcMethodsResponse = {
  ipc: string[]
  rpc: string[]
}

export const GetRpcMethodsRequestSchema = yup.object({
  namespace: yup.string().optional(),
})

export const GetRpcMethodsResponseSchema: yup.ObjectSchema<GetRpcMethodsResponse> = yup
  .object({
    ipc: yup.array(yup.string().defined()).defined(),
    rpc: yup.array(yup.string().defined()).defined(),
  })
  .defined()

router.register<typeof GetRpcMethodsRequestSchema, GetRpcMethodsResponse>(
  `${ApiNamespace.rpc}/getMethods`,
  GetRpcMethodsRequestSchema,
  (request, node): void => {
    const result = getRpcMethods(node, request.data?.namespace)

    request.end(result)
    return
  },
)

function getRpcMethods(node: IronfishNode, queryNamespace?: string): GetRpcMethodsResponse {
  const result: GetRpcMethodsResponse = {
    ipc: [],
    rpc: [],
  }

  for (const adapter of node.rpc.adapters) {
    if (!(adapter instanceof RpcIpcAdapter) && !(adapter instanceof RpcSocketAdapter)) {
      continue
    }

    if (adapter instanceof RpcIpcAdapter) {
      if (!adapter.ipc) {
        continue
      }

      const routes = adapter.router?.routes
      if (routes) {
        for (const namespace of routes.keys()) {
          if (queryNamespace && queryNamespace !== namespace) {
            continue
          }
          const methods = routes.get(namespace)
          if (methods) {
            for (const method of methods.keys()) {
              result.ipc.push(`${namespace}/${method}`)
            }
          }
        }
      }
    }

    if (adapter instanceof RpcSocketAdapter) {
      const routes = adapter.router?.routes
      if (routes) {
        for (const namespace of routes.keys()) {
          if (queryNamespace && queryNamespace !== namespace) {
            continue
          }
          const methods = routes.get(namespace)
          if (methods) {
            for (const method of methods.keys()) {
              result.rpc.push(`${namespace}/${method}`)
            }
          }
        }
      }
    }
  }

  return result
}
