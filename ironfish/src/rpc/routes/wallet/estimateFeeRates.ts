/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import {
  EstimateFeeRatesRequestSchema,
  EstimateFeeRatesResponse,
} from '../chain/estimateFeeRates'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

routes.register<typeof EstimateFeeRatesRequestSchema, EstimateFeeRatesResponse>(
  `${ApiNamespace.wallet}/estimateFeeRates`,
  EstimateFeeRatesRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    Assert.isNotNull(node.wallet.nodeClient)
    const rates = await node.wallet.nodeClient.chain.estimateFeeRates()

    request.end({ ...rates.content })
  },
)
