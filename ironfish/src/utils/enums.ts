/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isNumber } from 'lodash'

export type StrEnumValue<T> = T[keyof T]
export type StrEnum<T> = Record<keyof T, string>

export class StrEnumUtils {
  static getValues<T extends StrEnum<T>>(enumType: T): Array<StrEnumValue<T>> {
    return Object.values(enumType)
      .filter((v) => typeof v === 'string')
      .map((v) => v as StrEnumValue<T>)
  }

  static isInEnum<T extends StrEnum<T>>(value: unknown, enumType: T): value is StrEnumValue<T> {
    for (const enumValue of StrEnumUtils.getValues(enumType)) {
      if (enumValue === value) {
        return true
      }
    }

    return false
  }
}

export type NumEnum<T> = Record<keyof T, string | number>

export class NumberEnumUtils {
  /* Return all the possible values of a number enum e.g
   * enum E1 = { A, B, C} getNumValues(E1) --> [0, 1, 2]
   * enum E2 = { A = 1, B = 2, C = 3} getNumValues(E2) --> [1, 2, 3]
   */
  static getNumValues<T extends NumEnum<T>>(enumType: T): Array<number> {
    return Object.values(enumType).filter(isNumber)
  }
}
