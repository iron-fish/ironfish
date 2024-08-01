/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, RpcClient } from '@ironfish/sdk'
import { inputPrompt } from '../ui'

export async function promptExpiration(options: {
  client: RpcClient
  logger: Logger
}): Promise<number | undefined> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { client } = options

    const headSequence = (await client.wallet.getNodeStatus()).content.blockchain.head.sequence

    const prompt = `Enter an expiration block sequence for the transaction. You can also enter 0 for no expiration, or leave blank to use the default. The current chain head is ${headSequence}`

    const input = await inputPrompt(prompt)
    if (!input) {
      return
    }

    const number = parseInt(input, 10)

    if (Number.isNaN(number) || number < 0 || (number > 0 && number <= headSequence)) {
      options.logger.error(
        `Error: Expiration sequence must be 0, a number greater than the chain head sequence (${headSequence}), or blank to use the default.`,
      )
      continue
    }

    return number
  }
}
