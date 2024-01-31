/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { roundTwo, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type CreateSigningShareRequest = {
  signingPackage: string
  keyPackage: string
  unsignedTransaction: string
  seed: number //  TODO: remove when we have deterministic nonces
}

export type CreateSigningCommitmentResponse = {
  signingShare: string
}

export const CreateSigningCommitmentRequestSchema: yup.ObjectSchema<CreateSigningShareRequest> =
  yup
    .object({
      signingPackage: yup.string().defined(),
      keyPackage: yup.string().defined(),
      unsignedTransaction: yup.string().defined(),
      seed: yup.number().defined(),
    })
    .defined()

export const CreateSigningCommitmentResponseSchema: yup.ObjectSchema<CreateSigningCommitmentResponse> =
  yup
    .object({
      signingShare: yup.string().defined(),
    })
    .defined()

routes.register<typeof CreateSigningCommitmentRequestSchema, CreateSigningCommitmentResponse>(
  `${ApiNamespace.multisig}/createSigningShare`,
  CreateSigningCommitmentRequestSchema,
  (request, _context): void => {
    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const result = roundTwo(
      request.data.signingPackage,
      request.data.keyPackage,
      unsigned.publicKeyRandomness(),
      request.data.seed,
    )

    request.end({
      signingShare: result,
    })
  },
)
