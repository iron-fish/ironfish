/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { YupSchema, YupSchemaResult, YupUtils } from '../../utils'
import { StrEnumUtils } from '../../utils/enums'
import { RPC_ERROR_CODES } from '../adapters'
import { RpcResponseError, RpcValidationError } from '../adapters/errors'
import { RpcRequest } from '../request'
import { RpcServer } from '../server'
import { ApiNamespace } from './namespaces'
import { RpcContext } from './rpcContext'

export const ALL_API_NAMESPACES = StrEnumUtils.getValues(ApiNamespace)

export type RouteHandler<TRequest = unknown, TResponse = unknown> = (
  request: RpcRequest<TRequest, TResponse>,
  context: RpcContext,
) => Promise<void> | void

export class RouteNotFoundError extends RpcResponseError {
  constructor(route: string, namespace: string, method: string) {
    super(
      `No route found ${route} in namespace ${namespace} for method ${method}`,
      RPC_ERROR_CODES.ROUTE_NOT_FOUND,
      404,
    )
  }
}

export function parseRoute(
  route: string,
): [namespace: string | undefined, method: string | undefined] {
  const [n, m] = route.split('/')
  return [n, m]
}

export class Router {
  routes = new Routes()
  server: RpcServer

  constructor(routes: Routes, server: RpcServer) {
    this.routes = routes
    this.server = server
  }

  async route(route: string, request: RpcRequest): Promise<void> {
    const [namespace, method] = route.split('/')

    const methodRoute = this.routes.get(namespace, method)
    if (!methodRoute) {
      throw new RouteNotFoundError(route, namespace, method)
    }

    const { handler, schema, experimental } = methodRoute

    if (experimental && !this.server.context.config.experimental) {
      throw new RpcResponseError(
        `Experimental features for route ${route} is not enabled, please run server with --experimental flag`,
        RPC_ERROR_CODES.EXPERIMENTAL_METHOD_NOT_ENABLED,
        400,
      )
    }

    const { result, error } = await YupUtils.tryValidate(schema, request.data)
    if (error) {
      throw new RpcValidationError(error.message, 400)
    }
    request.data = result

    try {
      await handler(request, this.server.context)
    } catch (e: unknown) {
      if (e instanceof RpcResponseError) {
        throw e
      }
      if (e instanceof Error) {
        throw new RpcResponseError(e)
      }
      throw e
    }
  }
}

class Route {
  public handler: RouteHandler
  public schema: YupSchema
  public experimental: boolean

  constructor(handler: RouteHandler, schema: YupSchema, experimental = false) {
    this.handler = handler
    this.schema = schema
    this.experimental = experimental
  }
}

class Routes {
  routes = new Map<string, Map<string, Route>>()

  get(namespace: string, method: string): Route | undefined {
    const namespaceRoutes = this.routes.get(namespace)
    if (!namespaceRoutes) {
      return undefined
    }

    return namespaceRoutes.get(method)
  }

  register<TRequestSchema extends YupSchema, TResponse>(
    route: string,
    requestSchema: TRequestSchema,
    handler: RouteHandler<YupSchemaResult<TRequestSchema>, TResponse>,
    experimental = false,
  ): void {
    const [namespace, method] = parseRoute(route)

    Assert.isNotUndefined(namespace, `Invalid namespace: ${String(namespace)}: ${route}`)
    Assert.isNotUndefined(method, `Invalid method: ${String(namespace)}: ${route}`)

    let namespaceRoutes = this.routes.get(namespace)

    if (!namespaceRoutes) {
      namespaceRoutes = new Map<string, Route>()
      this.routes.set(namespace, namespaceRoutes)
    }
    namespaceRoutes.set(
      method,
      new Route(handler as RouteHandler<unknown, unknown>, requestSchema, experimental),
    )
  }

  filter(namespaces: string[]): Routes {
    const set = new Set(namespaces)
    const copy = new Routes()

    for (const [key, value] of this.routes) {
      if (set.has(key)) {
        copy.routes.set(key, value)
      }
    }

    return copy
  }
}

export const routes = new Routes()
