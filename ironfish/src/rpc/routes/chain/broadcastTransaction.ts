/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { ValidationError } from '../../adapters'
import { RpcRequest } from '../../request'

export type Request = {
  transaction: string
}

export type Response = {
  hash: string
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    hash: yup.string().defined(),
  })
  .defined()

export const route = 'broadcastTransaction'
export const handle = (request: RpcRequest<Request, Response>, node: IronfishNode): void => {
  const data = Buffer.from(request.data.transaction, 'hex')
  const transaction = new Transaction(data)

  const verify = node.chain.verifier.verifyCreatedTransaction(transaction)
  if (!verify.valid) {
    throw new ValidationError(`Invalid transaction, reason: ${String(verify.reason)}`)
  }

  node.memPool.acceptTransaction(transaction)
  node.peerNetwork.broadcastTransaction(transaction)

  request.end({
    hash: transaction.hash().toString('hex'),
  })
}
