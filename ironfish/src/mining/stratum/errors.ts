/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { StratumServerClient } from './stratumServer'

export class MessageMalformedError extends Error {
  constructor(sender: string, error: yup.ValidationError | string, method?: string) {
    super()

    if (typeof error === 'string') {
      this.message = error
    } else {
      this.message = `${sender} sent malformed request`
      if (method) {
        this.message += ` (${method})`
      }
      this.message + `: ${error.message}`
    }
  }
}

export class ClientMessageMalformedError extends MessageMalformedError {
  client: StratumServerClient

  constructor(
    client: StratumServerClient,
    error: yup.ValidationError | string,
    method?: string,
  ) {
    super(`Client ${client.id}`, error, method)
    this.client = client
  }
}

export class ServerMessageMalformedError extends MessageMalformedError {
  constructor(error: yup.ValidationError | string, method?: string) {
    super('Server', error, method)
  }
}
