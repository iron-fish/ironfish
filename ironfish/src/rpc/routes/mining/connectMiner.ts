/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type ConnectMinerRequest =
  | {
      name?: string
    }
  | undefined

export type ConnectMinerResponse = {
  minerId: number
  token: string
}

export const ConnectMinerRequestSchema: yup.ObjectSchema<ConnectMinerRequest> = yup
  .object({
    name: yup.string().max(32).optional(),
  })
  .optional()

export const ConnectMinerResponseSchema: yup.ObjectSchema<ConnectMinerResponse> = yup
  .object({
    minerId: yup.number().defined(),
    token: yup.string().defined(),
  })
  .required()
  .defined()

router.register<typeof ConnectMinerRequestSchema, ConnectMinerResponse>(
  `${ApiNamespace.miner}/connectMiner`,
  ConnectMinerRequestSchema,
  (request, node): void => {
    if (!node.miningDirector.started) {
      throw new ValidationError('The node does not have mining enabled')
    }

    const miner = node.miningDirector.connectMiner({ name: request.data?.name })

    const onClose = () => {
      node.logger.debug(`Miner ${miner.name} disconnected.`)
      miner.onRemoved.clear()
      node.miningDirector.disconnectMiner(miner)
    }

    const onRemoved = () => {
      request.end()
      request.onClose.off(onClose)
    }

    miner.onRemoved.once(onRemoved)
    request.onClose.once(onClose)

    node.logger.debug(`Miner ${miner.name} connected.`)

    request.stream({
      token: miner.token,
      minerId: miner.id,
    })
  },
)
