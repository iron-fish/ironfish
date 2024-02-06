/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSigningCommitment } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { AssertMultiSigSigner } from '../../../../wallet/account/account'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type CreateSigningCommitmentRequest = {
  account?: string
  seed: number //  TODO: remove when we have deterministic nonces
}

export type CreateSigningCommitmentResponse = {
  commitment: string
}

export const CreateSigningCommitmentRequestSchema: yup.ObjectSchema<CreateSigningCommitmentRequest> =
  yup
    .object({
      account: yup.string().defined(),
      seed: yup.number().defined(),
    })
    .defined()

export const CreateSigningCommitmentResponseSchema: yup.ObjectSchema<CreateSigningCommitmentResponse> =
  yup
    .object({
      commitment: yup.string().defined(),
    })
    .defined()

routes.register<typeof CreateSigningCommitmentRequestSchema, CreateSigningCommitmentResponse>(
  `${ApiNamespace.wallet}/multisig/createSigningCommitment`,
  CreateSigningCommitmentRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    AssertMultiSigSigner(account)

    request.end({
      commitment: createSigningCommitment(account.multiSigKeys.keyPackage, request.data.seed),
    })
  },
)
