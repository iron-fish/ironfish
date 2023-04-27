/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const MILLISECOND = 1
export const SECOND = 1000 * MILLISECOND
export const MINUTE = 60 * SECOND

export const ORE = 1
export const IRON = 100000000 * ORE

/** 1 / 100000000 */
export const ORE_TO_IRON = ORE / IRON

/**
 * Sleeps for a given duration.
 *
 * @param ms The duration to sleep for
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

/**
 * A helper function to get a random element from a set or array.
 *
 * @param set The set to get a random element from
 * @returns A random element from the set if elements exist, otherwise undefined
 */
export function getRandom<T>(list: Set<T> | Array<T>): T | undefined {
  let arr: Array<T> = []

  if (list instanceof Set) {
    arr = Array.from(list)
  } else {
    arr = list
  }

  if (arr.length === 0) {
    return undefined
  }

  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx]
}
