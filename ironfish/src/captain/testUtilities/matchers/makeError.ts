/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function makeError(
  error: string | null,
  success: string,
): { pass: boolean; message: () => string } {
  if (error !== null) {
    return {
      pass: false,
      message: () => error,
    }
  } else {
    return {
      pass: true,
      message: () => success,
    }
  }
}
