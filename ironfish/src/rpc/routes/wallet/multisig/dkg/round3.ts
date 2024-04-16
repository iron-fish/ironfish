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
  secretName: string
  round2SecretPackage: string
  round1PublicPackages: Array<string>
  round2PublicPackages: Array<string>
}

export type DkgRound3Response = Record<string, never>

export const DkgRound3RequestSchema: yup.ObjectSchema<DkgRound3Request> = yup
  .object({
    secretName: yup.string().defined(),
    round2SecretPackage: yup.string().defined(),
    round1PublicPackages: yup.array().of(yup.string().defined()).defined(),
    round2PublicPackages: yup.array().of(yup.string().defined()).defined(),
  })
  .defined()

export const DkgRound3ResponseSchema: yup.ObjectSchema<DkgRound3Response> = yup
  .object<Record<string, never>>({})
  .defined()

routes.register<typeof DkgRound3RequestSchema, DkgRound3Response>(
  `${ApiNamespace.wallet}/multisig/dkg/round3`,
  DkgRound3RequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const { secretName } = request.data
    const multisigSecret = await node.wallet.walletDb.getMultisigSecretByName(secretName)

    if (!multisigSecret) {
      throw new RpcValidationError(
        `Multisig secret with name '${secretName}' not found`,
        400,
        RPC_ERROR_CODES.MULTISIG_SECRET_NOT_FOUND,
      )
    }

    const secret = new multisig.ParticipantSecret(multisigSecret.secret)
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
      name: secretName,
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
    }

    await node.wallet.importAccount(accountImport)

    // TODO: add an option to skip rescan

    request.end({})
  },
)
