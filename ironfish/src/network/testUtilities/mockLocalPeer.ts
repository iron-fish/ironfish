/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ws from 'ws'
import wrtc from 'wrtc'
import { PrivateIdentity } from '../identity'
import { LocalPeer } from '../peers/localPeer'
import { mockPrivateIdentity } from './mockPrivateIdentity'
import { VERSION_PROTOCOL } from '../version'
import { mockChain } from '../../testUtilities/mocks'
import { IronfishBlockchain } from '../../blockchain'

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
  chain?: IronfishBlockchain
} = {}): LocalPeer {
  return new LocalPeer(identity, agent, version, chain || mockChain(), ws, wrtc)
}
