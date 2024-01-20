/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * NOTE: This endpoint will be deprecated in favor of `POST /wallet/createAccount` because
 * this endpoint does not follow the convention that all of our endpoints should follow which
 * is the verbObject naming convention. For example, `POST /wallet/burnAsset` burns an asset.
 */

import { ERROR_CODES, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { CreateAccountRequestSchema, CreateAccountResponse } from '../wallet'

routes.register<typeof CreateAccountRequestSchema, CreateAccountResponse>(
  `${ApiNamespace.wallet}/create`,
  CreateAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const name = request.data.name

    if (context.wallet.accountExists(name)) {
      throw new RpcValidationError(
        `There is already an account with the name ${name}`,
        400,
        ERROR_CODES.ACCOUNT_EXISTS,
      )
    }

    const account = await context.wallet.createAccount(name)
    if (context.wallet.nodeClient) {
      void context.wallet.scanTransactions()
    }

    let isDefaultAccount = false
    if (!context.wallet.hasDefaultAccount || request.data.default) {
      await context.wallet.setDefaultAccount(name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      publicAddress: account.publicAddress,
      isDefaultAccount,
    })
  },
)
