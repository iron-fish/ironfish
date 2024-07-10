/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export const ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'bytes32[3]',
        name: 'note',
        type: 'bytes32[3]',
      },
    ],
    name: 'EncryptedNote',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'bytes32[3]',
        name: 'note',
        type: 'bytes32[3]',
      },
    ],
    name: 'shield',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'shield_test',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]
