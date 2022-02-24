/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type Field =
  | {
      name: string
      type: 'string'
      value: string
    }
  | {
      name: string
      type: 'boolean'
      value: boolean
    }
  | {
      name: string
      type: 'float' | 'integer'
      value: number
    }
