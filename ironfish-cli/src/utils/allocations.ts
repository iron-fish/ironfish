/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MEMO_LENGTH } from '@ironfish/rust-nodejs'
import { CurrencyUtils, GenesisBlockAllocation, isValidPublicAddress } from '@ironfish/sdk'

export const parseAllocationsFile = (
  fileContent: string,
): { ok: true; allocations: GenesisBlockAllocation[] } | { ok: false; error: string } => {
  const allocations: GenesisBlockAllocation[] = []

  const errors = []
  let lineNum = 0
  for (const line of fileContent.split(/[\r\n]+/)) {
    lineNum++
    if (line.trim().length === 0) {
      continue
    }

    const [address, amountInIron, memo, ...rest] = line.split(',').map((v) => v.trim())

    if (rest.length > 0) {
      errors.push(`Line ${lineNum}: (${line}) contains more than 3 values.`)
      continue
    }

    // Check address length
    if (!isValidPublicAddress(address)) {
      errors.push(`Line ${lineNum}: (${line}) has an invalid public address.`)
      continue
    }

    // Check amount is positive and decodes as $IRON
    const amountInOre = CurrencyUtils.decodeIron(amountInIron)
    if (amountInOre < 0) {
      errors.push(`Line ${lineNum}: (${line}) contains a negative $IRON amount.`)
    }

    // Check memo length
    if (Buffer.from(memo).byteLength > MEMO_LENGTH) {
      errors.push(
        `Line ${lineNum}: (${line}) contains a memo with byte length > ${MEMO_LENGTH}.`,
      )
      continue
    }

    allocations.push({
      publicAddress: address,
      amountInOre: amountInOre,
      memo: memo,
    })
  }

  if (errors.length > 0) {
    console.log(errors)
  }

  return { ok: true, allocations }
}
