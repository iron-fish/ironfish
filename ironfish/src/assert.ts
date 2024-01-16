/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Constructor } from './utils/types'

export class Assert {
  static isUnreachable(x: never, message?: string): never {
    throw new Error(message || `Expected ${String(x)} to be unreachable`)
  }

  static isUndefined<T>(x: undefined | T, message?: string): asserts x is undefined {
    if (x !== undefined) {
      throw new Error(message || `Expected ${String(x)} to be undefined`)
    }
  }

  static isNotUndefined<T>(x: undefined | T, message?: string): asserts x is T {
    if (x === undefined) {
      throw new Error(message || `Expected value not to be undefined`)
    }
  }

  static isNotNull<T>(x: null | T, message?: string): asserts x is T {
    if (x === null) {
      throw new Error(message || `Expected value not to be null`)
    }
  }

  static isNull(x: unknown, message?: string): asserts x is null {
    if (x !== null) {
      throw new Error(message || `Expected value to be null`)
    }
  }

  static isEqual(a: unknown, b: unknown, message?: string): void {
    if (a !== b) {
      throw new Error(message || `Expected values to be equal: ${String(a)} vs ${String(b)}`)
    }
  }

  static isGreaterThan(a: number, b: number, message?: string): void {
    if (a <= b) {
      throw new Error(message || `Expected ${String(a)} to be greater than ${String(b)}`)
    }
  }

  static isNever(x: never, message?: string): never {
    throw new Error(message || `Expected value to be never: ${String(x)}`)
  }

  static isTrue(x: boolean, message?: string): asserts x is true {
    if (x === false) {
      throw new Error(message || `Expected value to be true`)
    }
  }

  static isFalse(x: boolean, message?: string): asserts x is false {
    if (x === true) {
      throw new Error(message || `Expected value to be false`)
    }
  }

  static isInstanceOf<T>(
    x: unknown,
    constructor: Constructor<T>,
    message?: string,
  ): asserts x is T {
    if (!(x instanceof constructor)) {
      throw new Error(message || `Expected value to be ${constructor.name} but was ${typeof x}`)
    }
  }

  static isString(x: unknown, message?: string): asserts x is string {
    if (typeof x !== 'string') {
      throw new Error(message || `Expected value to be string`)
    }
  }

  static isTruthy<T>(
    x: T,
    message?: string,
  ): asserts x is Exclude<T, null | undefined | 0 | false | ''> {
    const isFalsey = x == null || x === 0 || x === '' || x === false

    if (isFalsey) {
      throw new Error(message || `Expected value to be truthy`)
    }

    if (!isFalsey && !x) {
      throw new Error(`We must have forgotten a falsey value: ${String(x)}`)
    }
  }

  static bufferEquals(x: Buffer, y: Buffer, message?: string): void {
    if (!x.equals(y)) {
      // Not including the buffer contents in the message because they can
      // potentially be huge (also choosing the proper encoding may be a
      // problem)
      throw new Error(message || 'Expected buffers to have the same contents')
    }
  }

  static hasKeys<TObj extends Record<string, unknown>, TKeys extends keyof TObj>(
    obj: TObj,
    keys: TKeys[],
    message?: string,
  ): asserts obj is TKeys extends keyof TObj ? Required<Pick<TObj, TKeys>> : never {
    const missing = keys.filter((key) => !(key in obj))

    if (missing.length) {
      throw new Error(message || `Expected value to have keys ${String(missing)}`)
    }
  }
}
