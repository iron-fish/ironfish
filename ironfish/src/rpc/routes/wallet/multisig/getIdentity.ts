/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { RpcValidationError } from '../../../adapters/errors'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'

export type GetIdentityRequest = {
  name: string
}

export type GetIdentityResponse = {
  identity: string
}
export const GetIdentityRequestSchema: yup.ObjectSchema<GetIdentityRequest> = yup
  .object({
    name: yup.string().defined(),
  })
  .defined()

export const GetIdentityResponseSchema: yup.ObjectSchema<GetIdentityResponse> = yup
  .object({
    identity: yup.string().defined(),
  })
  .defined()

routes.register<typeof GetIdentityRequestSchema, GetIdentityResponse>(
  `${ApiNamespace.wallet}/multisig/getIdentity`,
  GetIdentityRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const { name } = request.data

    const secretBuffer = await context.wallet.walletDb.getMultisigSecret(name)

    if (secretBuffer === undefined) {
      throw new RpcValidationError(`No identity found with name ${name}`, 404)
    }

    const secret = new ParticipantSecret(secretBuffer)

    const identity = secret.toIdentity()

    request.end({ identity: identity.serialize().toString('hex') })
  },
)
