/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const SECOND = 1000
export const MINUTE = SECOND * 60

export const IRON = 100000000

/**
 * Sleeps for a given duration.
 *
 * @param ms The duration to sleep for
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Shortens a hash to 16 characters.
 * @param hash The hash to shorten
 * @returns The shortened hash
 */
export function short(hash: string): string {
  return hash.slice(0, 16)
}

/**
 * Creates an interval that runs a function at a random interval between `minDelay` and `maxDelay`.
 * @param fn The function to run
 * @param minDelay The minimum delay between function calls
 * @param maxDelay The maximum delay between function calls
 *
 * @returns An object with a clear function that can be called to clear the interval
 */
export function setRandomInterval(
  fn: () => void,
  minDelay: number, // in ms
  maxDelay: number, // in ms
): { clear(): void } {
  let timeout: NodeJS.Timeout

  const runInterval = () => {
    const timeoutFunction = () => {
      fn()
      runInterval()
    }

    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay

    timeout = setTimeout(timeoutFunction, delay)
  }

  runInterval()

  return {
    clear() {
      clearTimeout(timeout)
    },
  }
}
