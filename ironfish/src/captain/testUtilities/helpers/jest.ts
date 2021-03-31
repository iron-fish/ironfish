/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Asserts the type of a given function as a Jest mock.
 */
export function typeMock<T extends readonly unknown[], R>(
  func: (...args: [...T]) => R,
): jest.Mock<R, [...T]> {
  return func as jest.Mock<R, [...T]>
}
