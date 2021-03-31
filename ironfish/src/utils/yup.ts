/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { UnwrapPromise } from './types'

export type YupSchema<Result = unknown, Context = unknown> = yup.Schema<Result, Context>

export type YupSchemaResult<S extends yup.Schema<unknown, unknown>> = UnwrapPromise<
  ReturnType<S['validate']>
>

export class YupUtils {
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
}
