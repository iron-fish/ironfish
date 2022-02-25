/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ErrorUtils } from '../utils'

export type JobErrorSerialized = {
  type: string
  message: string
  stack?: string
  code?: string
}

export class JobError extends Error {
  type = 'JobError'
  code: string | undefined = undefined

  constructor(error?: unknown) {
    super()

    if (error) {
      this.type =
        typeof error === 'object' ? error?.constructor.name ?? typeof error : 'unknown'

      this.code = undefined
      this.stack = undefined
      this.message = ErrorUtils.renderError(error)

      if (error instanceof Error) {
        this.code = error.name
        this.stack = error.stack

        if (ErrorUtils.isNodeError(error)) {
          this.code = error.code
        }
      }
    }
  }

  serialize(): JobErrorSerialized {
    return {
      type: this.type,
      stack: this.stack,
      code: this.code,
      message: this.message,
    }
  }

  static deserialize(serialized: JobErrorSerialized): JobError {
    const result = new JobError()
    result.type = serialized.type
    result.stack = serialized.stack
    result.code = serialized.code
    result.message = serialized.message
    return result
  }
}

export class JobAbortedError extends JobError {}
