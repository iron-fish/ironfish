/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

// eslint-disable-next-line @typescript-eslint/ban-types
export type StopNodeRequest = undefined
export type StopNodeResponse = undefined

export const StopNodeRequestSchema: yup.MixedSchema<StopNodeRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const StopNodeResponseSchema: yup.MixedSchema<StopNodeRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof StopNodeRequestSchema, StopNodeResponse>(
  `${ApiNamespace.node}/stopNode`,
  StopNodeRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'shutdown', 'logger')

    context.logger.withTag('stopnode').debug('Shutting down')
    request.end()
    await context.shutdown()
  },
)
