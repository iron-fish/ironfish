/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../../assert'
import { WithRequired } from '../../../../utils'
import { Account, AssertMultisig } from '../../../../wallet'
import {
  MultisigHardwareSigner,
  MultisigSigner,
} from '../../../../wallet/interfaces/multisigKeys'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type GetAccountIdentityRequest = {
  account?: string
}

export type GetAccountIdentityResponse = {
  identity: string
}
export const GetAccountIdentityRequestSchema: yup.ObjectSchema<GetAccountIdentityRequest> = yup
  .object({
    account: yup.string().optional(),
  })
  .defined()

export const GetAccountIdentityResponseSchema: yup.ObjectSchema<GetAccountIdentityResponse> =
  yup
    .object({
      identity: yup.string().defined(),
    })
    .defined()

routes.register<typeof GetAccountIdentityRequestSchema, GetAccountIdentityResponse>(
  `${ApiNamespace.wallet}/multisig/getAccountIdentity`,
  GetAccountIdentityRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    AssertMultisigOwner(account)

    request.end({ identity: account.multisigKeys.identity })
  },
)

type MultisigOwnerAccount = WithRequired<Account, 'multisigKeys'> & {
  multisigKeys: MultisigSigner | MultisigHardwareSigner
}

function AssertMultisigOwner(account: Account): asserts account is MultisigOwnerAccount {
  AssertMultisig(account)
  Assert.isTrue(
    'identity' in account.multisigKeys,
    `Account '${account.name}' does not have a multisig identity`,
  )
}
