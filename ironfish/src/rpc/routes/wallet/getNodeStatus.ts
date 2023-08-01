/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { GetNodeStatusResponse, GetStatusRequestSchema } from '../node/getStatus'
import { ApiNamespace, routes } from '../router'

routes.register<typeof GetStatusRequestSchema, GetNodeStatusResponse>(
  `${ApiNamespace.wallet}/getNodeStatus`,
  GetStatusRequestSchema,
  async (request, { wallet }): Promise<void> => {
    Assert.isNotUndefined(wallet)

    if (!request.data?.stream) {
      const status = await wallet.nodeClient.node.getStatus()
      request.end(status.content)
      return
    }

    const statusStream = wallet.nodeClient.node.getStatusStream()
    for await (const content of statusStream.contentStream()) {
      request.stream(content)
    }
  },
)
