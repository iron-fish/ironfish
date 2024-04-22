/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { BufferSet } from 'buffer-map'
import * as yup from 'yup'
import { AssertMultisigSigner } from '../../../../wallet'
import { RpcValidationError } from '../../../adapters'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type CreateSignatureShareRequest = {
  account?: string
  signingPackage: string
}

export type CreateSignatureShareResponse = {
  signatureShare: string
}

export const CreateSignatureShareRequestSchema: yup.ObjectSchema<CreateSignatureShareRequest> =
  yup
    .object({
      account: yup.string().optional(),
      signingPackage: yup.string().defined(),
    })
    .defined()

export const CreateSignatureShareResponseSchema: yup.ObjectSchema<CreateSignatureShareResponse> =
  yup
    .object({
      signatureShare: yup.string().defined(),
    })
    .defined()

routes.register<typeof CreateSignatureShareRequestSchema, CreateSignatureShareResponse>(
  `${ApiNamespace.wallet}/multisig/createSignatureShare`,
  CreateSignatureShareRequestSchema,
  (request, node) => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)
    AssertMultisigSigner(account)

    const signingPackage = new multisig.SigningPackage(
      Buffer.from(request.data.signingPackage, 'hex'),
    )

    const participantIdentities = new BufferSet(account.getMultisigParticipantIdentities())
    for (const signer of signingPackage.signers()) {
      if (!participantIdentities.has(signer)) {
        throw new RpcValidationError(
          `Signing package contains commitment from unknown signer ${signer.toString('hex')}`,
        )
      }
    }

    const signatureShare = multisig.createSignatureShare(
      account.multisigKeys.secret,
      account.multisigKeys.keyPackage,
      request.data.signingPackage,
    )

    request.end({ signatureShare })
  },
)
