/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

export async function promptExpiration(options: { logger: Logger }): Promise<number> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await CliUx.ux.prompt(
      'Enter an expiration block sequence for the transaction. Enter 0 for no expiration',
      { required: true },
    )

    const number = parseInt(input, 10)

    if (Number.isNaN(number) || number < 0) {
      options.logger.error(
        'Error: Expiration sequence must be a number greater than or equal to 0.',
      )
      continue
    }

    return number
  }
}
