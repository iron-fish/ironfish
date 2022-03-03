/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { StratumServerClient } from './stratumServer'

export class StratumClientMessageMalformedError extends Error {
  client: StratumServerClient

  constructor(
    client: StratumServerClient,
    error: yup.ValidationError | string,
    method?: string,
  ) {
    super(
      typeof error === 'string'
        ? error
        : `Client ${client.id} sent malformed request${method ? ` (${method})` : ''}: ${
            error.message
          }`,
    )

    this.client = client
  }
}

export class StratumServerMessageMalformedError extends Error {
  constructor(error: yup.ValidationError | string, method?: string) {
    super(
      typeof error === 'string'
        ? error
        : `Server sent malformed request ${method ? `(${method})` : ''}: ${error.message}`,
    )
  }
}
