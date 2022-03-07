/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function map<TResult, TKey, TValue>(
  value: Map<TKey, TValue>,
  fn: (value: TValue, key: TKey) => TResult,
): Array<TResult> {
  const results: TResult[] = []

  value.forEach((value, key) => {
    results.push(fn(value, key))
  })

  return results
}

export const MapUtils = { map }
