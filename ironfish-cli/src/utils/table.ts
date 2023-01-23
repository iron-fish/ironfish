/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TimeUtils } from '@ironfish/sdk'
import { table } from '@oclif/core/lib/cli-ux/styled/table'

/**
 * Estimated max length of the longest TimeUtils.renderTime()
 */
const MAX_TIMESTAMP_LENGTH = TimeUtils.renderString(
  new Date(2024, 11, 25, 23, 59, 59).getTime(),
).length

const timestamp = <T extends Record<string, unknown>>(options?: {
  header?: string
  field?: string
  get?: (row: Record<string, unknown>) => string
  minWidth?: number
}): Partial<table.Column<T>> => {
  const header = options?.header ?? 'Timestamp'
  const field = options?.field ?? 'timestamp'
  const minWidth = options?.minWidth ?? MAX_TIMESTAMP_LENGTH

  const get =
    options?.get ??
    ((row: Record<string, unknown>) => {
      const value = row[field]
      if (!value) {
        return ''
      }
      return TimeUtils.renderString(Number(value))
    })

  return {
    header,
    get,
    minWidth,
  }
}

export const TableCols = { timestamp }
