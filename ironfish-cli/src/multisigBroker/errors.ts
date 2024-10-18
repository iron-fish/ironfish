/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { MultisigServerClient } from './serverClient'

export const MultisigBrokerErrorCodes = {
  DUPLICATE_SESSION_ID: 1,
  SESSION_ID_NOT_FOUND: 2,
  INVALID_DKG_SESSION_ID: 3,
  INVALID_SIGNING_SESSION_ID: 4,
  IDENTITY_NOT_ALLOWED: 5,
  NON_SESSION_CLIENT: 6,
}

export class MessageMalformedError extends Error {
  name = this.constructor.name

  constructor(sender: string, error: yup.ValidationError | string, method?: string) {
    super()

    if (typeof error === 'string') {
      this.message = error
    } else {
      this.message = `${sender} sent malformed request`
      if (method) {
        this.message += ` (${method})`
      }
      this.message += `: ${error.message}`
    }
  }
}

export class ClientMessageMalformedError extends MessageMalformedError {
  client: MultisigServerClient

  constructor(
    client: MultisigServerClient,
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

export class MultisigClientError extends Error {
  name = this.constructor.name
}

export class SessionDecryptionError extends MultisigClientError {
  constructor(message: string) {
    super(message)
  }
}

export class InvalidSessionError extends MultisigClientError {
  constructor(message: string) {
    super(message)
  }
}

export class IdentityNotAllowedError extends MultisigClientError {
  constructor(message: string) {
    super(message)
  }
}
