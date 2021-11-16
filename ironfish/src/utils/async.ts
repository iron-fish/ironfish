/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class AsyncUtils {
  static async materialize<T>(iter: AsyncIterable<T>): Promise<Array<T>> {
    const results = []
    for await (const result of iter) {
      results.push(result)
    }
    return results
  }

  static async *transform<TIn, TOut>(
    iter: AsyncGenerator<TIn, unknown, unknown>,
    transformer: (value: TIn) => TOut,
  ): AsyncGenerator<TOut, void, void> {
    for await (const result of iter) {
      yield transformer(result)
    }
  }

  static async count<T>(iter: AsyncIterable<T>): Promise<number> {
    let count = 0
    for await (const _result of iter) {
      ++count
    }
    return count
  }

  static async first<T>(iter: AsyncIterable<T>): Promise<T> {
    for await (const result of iter) {
      return result
    }

    throw new Error('No element found when expecting first in iter')
  }
}
