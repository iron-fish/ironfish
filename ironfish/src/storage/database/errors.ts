/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class DuplicateKeyError extends Error {}

export class DatabaseOpenError extends Error {
  constructor(message?: string, error?: Error) {
    super(message ?? error?.message)

    if (error && error.stack) {
      this.stack = error.stack
    }
  }
}
export class DatabaseIsOpenError extends DatabaseOpenError {}
export class DatabaseIsLockedError extends DatabaseOpenError {}
export class DatabaseIsCorruptError extends DatabaseOpenError {}

export class DatabaseVersionError extends DatabaseOpenError {
  readonly version: number
  readonly expected: number

  constructor(version: number, expected: number) {
    super(
      `Your database needs to be upgraded (v${version} vs v${expected}).\n` +
        `Run "ironfish migrations:start" or "ironfish start --upgrade"\n`,
    )

    this.version = version
    this.expected = expected
  }
}
