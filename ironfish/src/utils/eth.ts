/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function prefix0x(data: string): string {
  return data.startsWith('0x') ? data : `0x${data}`
}

function remove0x(data: string): string {
  return data.startsWith('0x') ? data.slice(2) : data
}

function numToHex(num: number | bigint): string {
  return prefix0x(num.toString(16))
}

function ifToEthSequence(num: number): number {
  return num - 1
}

function ethToIFSequence(num: number): number {
  return num + 1
}

export const EthUtils = { prefix0x, remove0x, numToHex, ifToEthSequence, ethToIFSequence }
