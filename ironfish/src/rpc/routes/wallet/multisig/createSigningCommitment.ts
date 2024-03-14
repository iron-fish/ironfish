/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { AssertMultisigSigner } from '../../../../wallet/account/account'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type CreateSigningCommitmentRequest = {
  account?: string
  unsignedTransaction: string
  signers: Array<{ identity: string }>
}

export type CreateSigningCommitmentResponse = {
  commitment: string
}

export const CreateSigningCommitmentRequestSchema: yup.ObjectSchema<CreateSigningCommitmentRequest> =
  yup
    .object({
      account: yup.string().optional(),
      unsignedTransaction: yup.string().defined(),
      signers: yup
        .array(
          yup
            .object({
              identity: yup.string().defined(),
            })
            .defined(),
        )
        .defined(),
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
    AssertMultisigSigner(account)

    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const signers = request.data.signers.map((signer) => signer.identity)

    // always include account's own identity. ironfish-frost deduplicates identities
    const accountSecret = new multisig.ParticipantSecret(
      Buffer.from(account.multisigKeys.secret, 'hex'),
    )
    const accountIdentity = accountSecret.toIdentity().serialize().toString('hex')
    signers.push(accountIdentity)

    const commitment = multisig.createSigningCommitment(
      account.multisigKeys.secret,
      account.multisigKeys.keyPackage,
      unsigned.hash(),
      signers,
    )

    request.end({ commitment })
  },
)
