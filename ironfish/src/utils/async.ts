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

  static async count<T>(iter: AsyncIterable<T>): Promise<number> {
    let count = 0
    for await (const _result of iter) ++count
    return count
  }
}
