/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  displayIronAmountWithCurrency,
  isValidAmount,
  MINIMUM_IRON_AMOUNT,
  RpcClient,
  WebApi,
} from '@ironfish/sdk'

const REGISTER_URL = 'https://testnet.ironfish.network/signup'

export async function verifyCanSend(
  client: RpcClient,
  api: WebApi,
  flags: Record<string, unknown>,
  fee: number,
  graffiti: string,
): Promise<{ canSend: boolean; errorReason: string | null }> {
  const status = await client.status()
  if (!status.content.blockchain.synced) {
    return {
      canSend: false,
      errorReason: `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
    }
  }

  let user
  try {
    user = await api.findUser({ graffiti })
  } catch (error: unknown) {
    if (error instanceof Error) {
      return {
        canSend: false,
        errorReason: error.message,
      }
    }

    return {
      canSend: false,
      errorReason: `There is a problem with the Iron Fish API. Please try again later.`,
    }
  }

  if (!user) {
    return {
      canSend: false,
      errorReason: `Graffiti not registered. Register at ${REGISTER_URL} and try again`,
    }
  }

  const expirationSequenceDelta = flags.expirationSequenceDelta as number | undefined
  if (expirationSequenceDelta !== undefined && expirationSequenceDelta < 0) {
    return {
      canSend: false,
      errorReason: `Expiration sequence delta must be non-negative`,
    }
  }

  if (expirationSequenceDelta !== undefined && expirationSequenceDelta > 120) {
    return {
      canSend: false,
      errorReason: 'Expiration sequence delta should not be above 120 blocks',
    }
  }

  if (!isValidAmount(fee)) {
    return {
      canSend: false,
      errorReason: `The minimum fee is ${displayIronAmountWithCurrency(
        MINIMUM_IRON_AMOUNT,
        false,
      )}`,
    }
  }

  return { canSend: true, errorReason: null }
}
