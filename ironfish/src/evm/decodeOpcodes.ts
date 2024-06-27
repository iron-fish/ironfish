/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { getOpcodesForHF } from '@ethereumjs/evm'
import { bytesToHex } from '@ethereumjs/util'

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun })
const opcodes = getOpcodesForHF(common).opcodes

export function nameOpCodes(raw: Uint8Array) {
  const resultingCodes: string[] = []
  let pushData = new Uint8Array()

  for (let i = 0; i < raw.length; i++) {
    const pc = i
    const curOpCode = opcodes.get(raw[pc])?.name

    // no destinations into the middle of PUSH
    if (curOpCode?.slice(0, 4) === 'PUSH') {
      const jumpNum = raw[pc] - 0x5f
      pushData = raw.subarray(pc + 1, pc + jumpNum + 1)
      i += jumpNum
    }

    const code =
      pad(pc, roundLog(raw.length, 10)) +
      '  ' +
      curOpCode +
      ' ' +
      (pushData?.length > 0 ? bytesToHex(pushData) : '')

    resultingCodes.push(code)

    pushData = new Uint8Array()
  }

  return resultingCodes
}

function pad(num: number, size: number) {
  let s = num + ''
  while (s.length < size) {
    s = '0' + s
  }
  return s
}

function log(num: number, base: number) {
  return Math.log(num) / Math.log(base)
}

function roundLog(num: number, base: number) {
  return Math.ceil(log(num, base))
}
