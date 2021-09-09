/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { IronfishNode } from '../../node'
import { YupSchema, YupSchemaResult, YupUtils } from '../../utils'
import { StrEnumUtils } from '../../utils/enums'
import { ERROR_CODES } from '../adapters'
import { ResponseError, ValidationError } from '../adapters/errors'
import { Request } from '../request'
import { RpcServer } from '../server'

export enum ApiNamespace {
  account = 'account',
  chain = 'chain',
  config = 'config',
  event = 'event',
  faucet = 'faucet',
  miner = 'miner',
  node = 'node',
  peer = 'peer',
  transaction = 'transaction',
  telemetry = 'telemetry',
  worker = 'worker',
}

export const ALL_API_NAMESPACES = StrEnumUtils.getValues(ApiNamespace)

export type RouteHandler<TRequest = unknown, TResponse = unknown> = (
  request: Request<TRequest, TResponse>,
  node: IronfishNode,
) => Promise<void> | void

export class RouteNotFoundError extends ResponseError {
  constructor(route: string, namespace: string, method: string) {
    super(
      `No route found ${route} in namespace ${namespace} for method ${method}`,
      ERROR_CODES.ROUTE_NOT_FOUND,
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
  routes = new Map<string, Map<string, { handler: RouteHandler; schema: YupSchema }>>()
  server: RpcServer | null = null

  register<TRequestSchema extends YupSchema, TResponse>(
    route: string,
    requestSchema: TRequestSchema,
    handler: RouteHandler<YupSchemaResult<TRequestSchema>, TResponse>,
  ): void {
    const [namespace, method] = parseRoute(route)

    Assert.isNotUndefined(namespace, `Invalid namespace: ${String(namespace)}: ${route}`)
    Assert.isNotUndefined(method, `Invalid method: ${String(namespace)}: ${route}`)

    let namespaceRoutes = this.routes.get(namespace)

    if (!namespaceRoutes) {
      namespaceRoutes = new Map<string, { handler: RouteHandler; schema: YupSchema }>()
      this.routes.set(namespace, namespaceRoutes)
    }

    namespaceRoutes.set(method, {
      handler: handler as RouteHandler<unknown, unknown>,
      schema: requestSchema,
    })
  }

  async route(route: string, request: Request): Promise<void> {
    const [namespace, method] = route.split('/')

    const namespaceRoutes = this.routes.get(namespace)
    if (!namespaceRoutes) {
      throw new RouteNotFoundError(route, namespace, method)
    }

    const methodRoute = namespaceRoutes.get(method)
    if (!methodRoute) {
      throw new RouteNotFoundError(route, namespace, method)
    }

    const { handler, schema } = methodRoute

    const { error } = await YupUtils.tryValidate(schema, request.data)
    if (error) {
      throw new ValidationError(error.message, 400)
    }

    Assert.isNotNull(this.server)

    try {
      await handler(request, this.server.node)
    } catch (e: unknown) {
      if (e instanceof ResponseError) {
        throw e
      }
      if (e instanceof Error) {
        throw new ResponseError(e)
      }
      throw e
    }
  }

  filter(namespaces: string[]): Router {
    const set = new Set(namespaces)
    const copy = new Router()
    copy.server = this.server

    for (const [key, value] of this.routes) {
      if (set.has(key)) {
        copy.routes.set(key, value)
      }
    }

    return copy
  }
}

export const router = new Router()
