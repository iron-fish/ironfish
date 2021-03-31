/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { networkIdentifier as networkIdentifierConfig } from '../config'
import { NetworkIdentifier } from '../types'

export const isValidNetworkIdentifier = (networkIdentifier: NetworkIdentifier): boolean => {
  return (
    networkIdentifier.blockchain === networkIdentifierConfig.blockchain &&
    networkIdentifier.network === networkIdentifierConfig.network
  )
}
