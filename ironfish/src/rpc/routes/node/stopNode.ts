/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { ApiNamespace, routes } from '../router'

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
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    node.logger.withTag('stopnode').info('Shutting down')
    request.end()
    await node.shutdown()
  },
)
