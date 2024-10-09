/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger } from '@ironfish/sdk'
import * as ui from '../ui'
import { MultisigClient, MultisigTcpClient, MultisigTlsClient } from './clients'

async function parseConnectionOptions(options: {
  connection?: string
  hostname: string
  port: number
  sessionId?: string
  passphrase?: string
  logger: Logger
}): Promise<{
  hostname: string
  port: number
  sessionId: string
  passphrase: string
}> {
  let hostname
  let port
  let sessionId
  let passphrase
  if (options.connection) {
    try {
      const url = new URL(options.connection)
      if (url.host) {
        hostname = url.hostname
      }
      if (url.port) {
        port = Number(url.port)
      }
      if (url.username) {
        sessionId = url.username
      }
      if (url.password) {
        passphrase = url.password
      }
    } catch (e) {
      if (e instanceof TypeError && e.message.includes('Invalid URL')) {
        options.logger.error(ErrorUtils.renderError(e))
      }
      throw e
    }
  }

  hostname = hostname ?? options.hostname
  port = port ?? options.port

  sessionId = sessionId ?? options.sessionId
  if (!sessionId) {
    sessionId = await ui.inputPrompt(
      'Enter the ID of a multisig session to join, or press enter to start a new session',
      false,
    )
  }

  passphrase = passphrase ?? options.passphrase
  if (!passphrase) {
    passphrase = await ui.inputPrompt('Enter the passphrase for the multisig session', true)
  }

  return {
    hostname,
    port,
    sessionId,
    passphrase,
  }
}

function createClient(
  hostname: string,
  port: number,
  options: { passphrase: string; tls: boolean; logger: Logger },
): MultisigClient {
  if (options.tls) {
    return new MultisigTlsClient({
      hostname,
      port,
      passphrase: options.passphrase,
      logger: options.logger,
    })
  } else {
    return new MultisigTcpClient({
      hostname,
      port,
      passphrase: options.passphrase,
      logger: options.logger,
    })
  }
}

export const MultisigBrokerUtils = {
  parseConnectionOptions,
  createClient,
}
