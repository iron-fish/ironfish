/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * NOTE: This endpoint will be deprecated in favor of `POST /wallet/renameAccount` because
 * this endpoint does not follow the convention that all of our endpoints should follow which
 * is the verbObject naming convention. For example, `POST /wallet/burnAsset` burns an asset.
 */

import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RenameAccountRequestSchema, RenameAccountResponse } from '../wallet'
import { getAccount } from './utils'

routes.register<typeof RenameAccountRequestSchema, RenameAccountResponse>(
  `${ApiNamespace.wallet}/rename`,
  RenameAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    await context.wallet.setName(account, request.data.newName)
    request.end()
  },
)
