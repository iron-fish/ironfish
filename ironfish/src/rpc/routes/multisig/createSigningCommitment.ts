/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSigningCommitment } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { RpcSigningCommitments, RpcSigningCommitmentsSchema } from './types'

export type CreateSigningCommitmentRequest = {
  keyPackage: string
  seed: number //  TODO: remove when we have deterministic nonces
}

export type CreateSigningCommitmentResponse = RpcSigningCommitments

export const CreateSigningCommitmentRequestSchema: yup.ObjectSchema<CreateSigningCommitmentRequest> =
  yup
    .object({
      keyPackage: yup.string().defined(),
      seed: yup.number().defined(),
    })
    .defined()

export const CreateSigningCommitmentResponseSchema: yup.ObjectSchema<CreateSigningCommitmentResponse> =
  RpcSigningCommitmentsSchema

routes.register<typeof CreateSigningCommitmentRequestSchema, CreateSigningCommitmentResponse>(
  `${ApiNamespace.multisig}/createSigningCommitment`,
  CreateSigningCommitmentRequestSchema,
  (request, _context): void => {
    const result = createSigningCommitment(request.data.keyPackage, request.data.seed)

    request.end({
      hiding: result.hiding,
      binding: result.binding,
    })
  },
)
