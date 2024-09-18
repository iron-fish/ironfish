/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import {
  DuplicateAccountNameError,
  DuplicateIdentityError,
  DuplicateIdentityNameError,
} from '../../../../wallet/errors'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'

export type ImportParticipantRequest = {
  name: string
  identity: string
  secret?: string
}

export type ImportParticipantResponse = {
  identity: string
}

export const ImportParticipantRequestSchema: yup.ObjectSchema<ImportParticipantRequest> = yup
  .object({
    name: yup.string().defined(),
    identity: yup.string().defined(),
    secret: yup.string().optional(),
  })
  .defined()

export const ImportParticipantResponseSchema: yup.ObjectSchema<ImportParticipantResponse> = yup
  .object({
    identity: yup.string().defined(),
  })
  .defined()

routes.register<typeof ImportParticipantRequestSchema, ImportParticipantResponse>(
  `${ApiNamespace.wallet}/multisig/importParticipant`,
  ImportParticipantRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    if (await context.wallet.walletDb.hasMultisigSecretName(request.data.name)) {
      throw new DuplicateIdentityNameError(request.data.name)
    }

    if (
      await context.wallet.walletDb.getMultisigIdentity(
        Buffer.from(request.data.identity, 'hex'),
      )
    ) {
      throw new DuplicateIdentityError(request.data.identity)
    }

    if (context.wallet.getAccountByName(request.data.name)) {
      throw new DuplicateAccountNameError(request.data.name)
    }

    await context.wallet.walletDb.putMultisigIdentity(
      Buffer.from(request.data.identity, 'hex'),
      {
        name: request.data.name,
        secret: request.data.secret ? Buffer.from(request.data.secret, 'hex') : undefined,
      },
    )

    request.end({ identity: request.data.identity })
  },
)
