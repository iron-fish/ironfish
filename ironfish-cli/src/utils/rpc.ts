/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isResponseUserError, RequestError } from '@ironfish/sdk'

export function hasUserResponseError(error: unknown): error is RequestError {
  return (
    error instanceof RequestError && !!error.response && isResponseUserError(error.response)
  )
}
