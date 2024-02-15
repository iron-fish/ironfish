/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'

export type CreateSecretRequest = {
  name: string
}

export type CreateSecretResponse = {
  secret: string
}
export const CreateSecretRequestSchema: yup.ObjectSchema<CreateSecretRequest> = yup
  .object({
    name: yup.string().defined(),
  })
  .defined()

export const CreateSecretResponseSchema: yup.ObjectSchema<CreateSecretResponse> = yup
  .object({
    secret: yup.string().defined(),
  })
  .defined()

routes.register<typeof CreateSecretRequestSchema, CreateSecretResponse>(
  `${ApiNamespace.wallet}/multisig/createSecret`,
  CreateSecretRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const { name } = request.data

    const secret = ParticipantSecret.random()
    const secretBuffer = secret.serialize()

    await context.wallet.walletDb.putMultisigSecret(name, secretBuffer)

    request.end({ secret: secretBuffer.toString('hex') })
  },
)
