/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../../blockchain'
import { mockChain } from '../../testUtilities/mocks'
import { PrivateIdentity } from '../identity'
import { LocalPeer } from '../peers/localPeer'
import { NodeDataChannelType } from '../types'
import { VERSION_PROTOCOL } from '../version'
import { WebSocketClient } from '../webSocketClient'
import { mockPrivateIdentity } from './mockPrivateIdentity'

const mockNodeDataChannel: NodeDataChannelType = {} as unknown as NodeDataChannelType

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
    chain || mockChain(),
    WebSocketClient,
    mockNodeDataChannel,
    0,
    true,
  )
}
