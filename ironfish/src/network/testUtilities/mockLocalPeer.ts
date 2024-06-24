/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable @typescript-eslint/no-empty-function */
import { Blockchain } from '../../blockchain'
import { mockChain } from '../../testUtilities/mocks'
import { PrivateIdentity } from '../identity'
import { LocalPeer } from '../peers/localPeer'
import { VERSION_PROTOCOL } from '../version'
import { WebSocketClient } from '../webSocketClient'
import { mockPrivateIdentity } from './mockPrivateIdentity'

/**
 * Utility to create a fake "keypair" for testing the network layer
 */
export function mockLocalPeer({
  identity = mockPrivateIdentity('local'),
  agent = 'sdk/1/cli',
  version = VERSION_PROTOCOL,
  chain,
}: {
  identity?: PrivateIdentity
  agent?: string
  version?: number
  chain?: Blockchain
} = {}): LocalPeer {
  return new LocalPeer(
    identity,
    agent,
    version,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    chain || mockChain(),
    WebSocketClient,
    0,
    true,
  )
}
