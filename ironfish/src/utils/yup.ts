/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { CurrencyUtils } from './currency'
import { UnwrapPromise } from './types'

export type YupSchema<Result = unknown, Context = unknown> = yup.Schema<Result, Context>

export type YupSchemaResult<S extends yup.Schema<unknown, unknown>> = UnwrapPromise<
  ReturnType<S['validate']>
>

export class YupUtils {
  static isPositiveInteger = yup.number().integer().min(0)
  static isPort = yup.number().integer().min(1).max(65535)
  static isPercent = yup.number().min(0).max(100)
  static isUrl = yup.string().url()

  static currency = (options?: { min?: bigint }): yup.StringSchema => {
    let schema = yup.string().test('currency', `Must be encoded currency`, (val) => {
      if (val == null) {
        return true
      }

      const [value] = CurrencyUtils.decodeTry(val)
      return value != null
    })

    if (options?.min != null) {
      const min = options?.min

      schema = schema.test(
        'min',
        `value must be equal to or greater than ${min.toString()}`,
        (val) => {
          if (val == null) {
            return true
          }

          const [value] = CurrencyUtils.decodeTry(val)
          return value != null && value >= min
        },
      )
    }

    return schema
  }

  static async tryValidate<S extends YupSchema>(
    schema: S,
    value: unknown,
    options?: yup.ValidateOptions<unknown>,
  ): Promise<
    { result: YupSchemaResult<S>; error: null } | { result: null; error: yup.ValidationError }
  > {
    if (!options) {
      options = { stripUnknown: true }
    }

    if (options.stripUnknown === undefined) {
      options.stripUnknown = true
    }

    try {
      const result = await schema.validate(value, options)
      return { result: result as YupSchemaResult<S>, error: null }
    } catch (e) {
      if (e instanceof yup.ValidationError) {
        return { result: null, error: e }
      }
      throw e
    }
  }

  static tryValidateSync<S extends YupSchema>(
    schema: S,
    value: unknown,
    options?: yup.ValidateOptions<unknown>,
  ):
    | { result: YupSchemaResult<S>; error: null }
    | { result: null; error: yup.ValidationError } {
    if (!options) {
      options = { stripUnknown: true }
    }

    if (options.stripUnknown === undefined) {
      options.stripUnknown = true
    }

    try {
      const result = schema.validateSync(value, options) as YupSchemaResult<S>
      return { result: result, error: null }
    } catch (e) {
      if (e instanceof yup.ValidationError) {
        return { result: null, error: e }
      }
      throw e
    }
  }

  static union<
    // eslint-disable-next-line @typescript-eslint/ban-types
    T extends object | null | undefined = object | undefined,
    // eslint-disable-next-line @typescript-eslint/ban-types
    U extends object | null | undefined = object | undefined,
  >(schema: yup.ObjectSchema<T>, append: yup.ObjectSchema<U>): yup.ObjectSchema<T & U> {
    const result = yup
      .object({
        ...schema.fields,
        ...append.fields,
      })
      .defined()

    return result as yup.ObjectSchema<T & U>
  }
}
