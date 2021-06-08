/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class Assert {
  static isUnreachable(x: never): never {
    throw new Error(x)
  }

  static isUndefined<T>(x: undefined | T, message?: string): asserts x is undefined {
    if (x !== undefined) throw new Error(message || `Expected ${String(x)} to be undefined`)
  }

  static isNotUndefined<T>(x: undefined | T, message?: string): asserts x is T {
    if (x === undefined) throw new Error(message || `Expected value not to be undefined`)
  }

  static isNotNull<T>(x: null | T, message?: string): asserts x is T {
    if (x === null) throw new Error(message || `Expected value not to be null`)
  }

  static isNull(x: unknown, message?: string): asserts x is null {
    if (x !== null) throw new Error(message || `Expected value to be null`)
  }

  static isNever(x: never): never {
    throw new Error(`Expected value to be never: ${JSON.stringify(x)}`)
  }

  static isTrue(x: boolean, message?: string): asserts x is true {
    if (x === false) throw new Error(message || `Expected value to be true`)
  }

  static isFalse(x: boolean, message?: string): asserts x is false {
    if (x === true) throw new Error(message || `Expected value to be false`)
  }
}
