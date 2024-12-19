/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../../../assert'
import { FullNode } from '../../../../../node'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../../wallet'
import { RPC_ERROR_CODES, RpcValidationError } from '../../../../adapters'
import { ApiNamespace } from '../../../namespaces'
import { routes } from '../../../router'

export type DkgRound3Request = {
  participantName: string
  round2SecretPackage: string
  round1PublicPackages: Array<string>
  round2PublicPackages: Array<string>
  accountName?: string
  accountCreatedAt?: number
}

export type DkgRound3Response = {
  name: string
  publicAddress: string
}

export const DkgRound3RequestSchema: yup.ObjectSchema<DkgRound3Request> = yup
  .object({
    participantName: yup.string().defined(),
    round2SecretPackage: yup.string().defined(),
    round1PublicPackages: yup.array().of(yup.string().defined()).defined(),
    round2PublicPackages: yup.array().of(yup.string().defined()).defined(),
    accountName: yup.string().optional(),
    accountCreatedAt: yup.number().optional(),
  })
  .defined()

export const DkgRound3ResponseSchema: yup.ObjectSchema<DkgRound3Response> = yup
  .object({
    name: yup.string().defined(),
    publicAddress: yup.string().defined(),
  })
  .defined()

routes.register<typeof DkgRound3RequestSchema, DkgRound3Response>(
  `${ApiNamespace.wallet}/multisig/dkg/round3`,
  DkgRound3RequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const { participantName } = request.data
    const multisigSecret = await node.wallet.walletDb.getMultisigSecretByName(participantName)

    if (!multisigSecret) {
      throw new RpcValidationError(
        `Multisig secret with name '${participantName}' not found`,
        400,
        RPC_ERROR_CODES.MULTISIG_SECRET_NOT_FOUND,
      )
    }

    const secret = new multisig.ParticipantSecret(multisigSecret)
    const identity = secret.toIdentity().serialize().toString('hex')

    const {
      publicAddress,
      keyPackage,
      publicKeyPackage,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      proofAuthorizingKey,
    } = multisig.dkgRound3(
      secret,
      request.data.round2SecretPackage,
      request.data.round1PublicPackages,
      request.data.round2PublicPackages,
    )

    const accountImport = {
      name: request.data.accountName ?? participantName,
      version: ACCOUNT_SCHEMA_VERSION,
      createdAt: null,
      spendingKey: null,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      publicAddress,
      proofAuthorizingKey,
      multisigKeys: {
        identity,
        keyPackage,
        publicKeyPackage,
      },
      ledger: false,
    }

    const account = await node.wallet.importAccount(accountImport, {
      createdAt: request.data.accountCreatedAt,
    })
    await node.wallet.skipRescan(account)

    request.end({
      name: account.name,
      publicAddress: account.publicAddress,
    })
  },
)
