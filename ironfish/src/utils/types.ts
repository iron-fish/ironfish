/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Equivalent to the builtin Partial<T> just recursive.
 *
 * @see https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype
 */
export type PartialRecursive<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? PartialRecursive<U>[]
    : T[P] extends Record<string, unknown>
    ? PartialRecursive<T[P]>
    : T[P]
}

/**
 * Converts a type from Promise<T> to T.
 *
 * This does not unwrap recursively.
 */
export type UnwrapPromise<T> = T extends Promise<infer U>
  ? U
  : T extends (...args: unknown[]) => Promise<infer U>
  ? U
  : T extends (...args: unknown[]) => infer U
  ? U
  : T

/**
 * The return type of setTimeout, this type be used with clearTimeout
 *
 * This exists because the return type is different on the web versus node
 * */
export type SetTimeoutToken = ReturnType<typeof setTimeout>

/**
 * The return type of `setInterval`. This type can be used with `clearInterval`.
 */
export type SetIntervalToken = ReturnType<typeof setInterval>

export function IsNodeTimeout(timer: number | NodeJS.Timeout): timer is NodeJS.Timeout {
  return typeof timer !== 'number'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T> = new (...args: any[]) => T

// eslint-disable-next-line @typescript-eslint/ban-types
export function HasOwnProperty<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): boolean {
  return Object.hasOwnProperty.call(obj, prop)
}

// When used, this type will require a value to be set and non-null
// ie Account.spendingKey = string | null
// with WithNonNull<Account, 'spendingKey'>, the return type has Account.spendingKey = string
export type WithNonNull<T, K extends keyof T> = T & { [P in K]: NonNullable<T[P]> }
