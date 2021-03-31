/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type PromiseResolve<T> = (value: T) => void
export type PromiseReject = (error?: unknown) => void

/**
 * This creates a promise and splits it out into the promise,
 * the resolve and reject functions. Useful when you are
 * creating pending promises resolved by some later code.
 */
export class PromiseUtils {
  static split<T>(): [Promise<T>, PromiseResolve<T>, PromiseReject] {
    const handlers: {
      resolve: PromiseResolve<T> | null
      reject: PromiseReject | null
    } = { resolve: null, reject: null }

    const promise = new Promise<T>((resolve, reject) => {
      handlers.resolve = resolve
      handlers.reject = reject
    })

    return [promise, handlers.resolve as PromiseResolve<T>, handlers.reject as PromiseReject]
  }

  static sleep(timeMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, timeMs))
  }
}
