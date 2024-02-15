/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../../adapters/errors'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'

export type CreateIdentityRequest = {
  name: string
}

export type CreateIdentityResponse = {
  identity: string
}
export const CreateIdentityRequestSchema: yup.ObjectSchema<CreateIdentityRequest> = yup
  .object({
    name: yup.string().defined(),
  })
  .defined()

export const CreateIdentityResponseSchema: yup.ObjectSchema<CreateIdentityResponse> = yup
  .object({
    identity: yup.string().defined(),
  })
  .defined()

routes.register<typeof CreateIdentityRequestSchema, CreateIdentityResponse>(
  `${ApiNamespace.wallet}/multisig/createIdentity`,
  CreateIdentityRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const { name } = request.data

    await context.wallet.walletDb.db.transaction(async (tx) => {
      if (await context.wallet.walletDb.hasMultisigSecret(name, tx)) {
        throw new RpcValidationError(
          `Identity already exists with name ${name}`,
          400,
          RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME,
        )
      }

      const secret = ParticipantSecret.random()
      const identity = secret.toIdentity()

      await context.wallet.walletDb.putMultisigSecret(name, secret.serialize(), tx)

      request.end({ identity: identity.serialize().toString('hex') })
    })
  },
)
