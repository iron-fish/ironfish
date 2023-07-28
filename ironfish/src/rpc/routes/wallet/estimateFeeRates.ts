/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import {
  EstimateFeeRatesRequestSchema,
  EstimateFeeRatesResponse,
} from '../chain/estimateFeeRates'
import { ApiNamespace, routes } from '../router'

routes.register<typeof EstimateFeeRatesRequestSchema, EstimateFeeRatesResponse>(
  `${ApiNamespace.wallet}/estimateFeeRates`,
  EstimateFeeRatesRequestSchema,
  async (request, { wallet }): Promise<void> => {
    Assert.isNotUndefined(wallet)

    const rates = await wallet.nodeClient.chain.estimateFeeRates()

    request.end({ ...rates.content })
  },
)
