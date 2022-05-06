/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function toHuman(memo: string): string {
  return memo.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
}

export const MemoUtils = {
  toHuman,
}
