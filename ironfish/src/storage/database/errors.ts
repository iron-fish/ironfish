/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class TransactionWrongDatabaseError extends Error {
  name = this.constructor.name

  constructor(store: string) {
    super(`Wrong transaction database when using store ${store}`)
  }
}

export class DuplicateKeyError extends Error {
  name = this.constructor.name
}

export class DatabaseOpenError extends Error {
  name = this.constructor.name

  constructor(message?: string, error?: { message: string; stack?: string }) {
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

  constructor(current: number, version: number) {
    super(
      current <= version
        ? `Your database needs to be upgraded (v${current} vs v${version}).\n` +
            `Run "ironfish migrations:start" or "ironfish start --upgrade"\n`
        : `Your database is newer than your node.\n` +
            `Your database is ${current} and your node is ${version}.\n`,
    )

    this.version = current
    this.expected = version
  }
}
