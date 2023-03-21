/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isRpcResponseUserError, RpcRequestError } from '@ironfish/sdk'

export function hasUserResponseError(error: unknown): error is RpcRequestError {
  return (
    error instanceof RpcRequestError &&
    !!error.response &&
    isRpcResponseUserError(error.response)
  )
}
