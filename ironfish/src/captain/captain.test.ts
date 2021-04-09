/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RangeHasher } from '../merkletree'
import { makeCaptain, TestCaptain, TestStrategy } from './testUtilities'
import { NodeMessageType } from '../network/messages'

describe('Captain', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let captain: TestCaptain

  beforeEach(async () => {
    captain = await makeCaptain(strategy)

    captain.onRequestBlocks.on((hash, nextBlockDirection) => {
      captain.blockSyncer.handleBlockRequestError({
        type: NodeMessageType.Blocks,
        payload: {
          hash: hash?.toString(),
          nextBlockDirection: nextBlockDirection,
        },
      })
    })
  })

  it('constructs a Captain object', () => {
    expect(captain).toBeDefined()
  })

  it('starts and stops a Captain object', async () => {
    expect(() => captain.start()).not.toThrow()
    await expect(captain.shutdown()).resolves.not.toBeDefined()
  })
})
