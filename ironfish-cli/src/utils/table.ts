/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TimeUtils } from '@ironfish/sdk'
import { table } from '@oclif/core/lib/cli-ux/styled/table'

/**
 * Estimated max length of the longest TimeUtils.renderTime()
 *
 * I chose a date where all time components in en-us have 2 digits
 * this will be wrong in some cases but it's a decent heuristic.
 *
 * 12/25/2024 11:59:59 PM EST
 */
const MAX_TIMESTAMP_LENGTH = TimeUtils.renderString(
  new Date(2024, 11, 25, 23, 59, 59).getTime(),
).length

const timestamp = <T extends Record<string, unknown>>(options?: {
  streaming?: boolean
  header?: string
  field?: string
  get?: (row: Record<string, unknown>) => string
  minWidth?: number
}): Partial<table.Column<T>> => {
  const header = options?.header ?? 'Timestamp'
  const field = options?.field ?? 'timestamp'

  // Are you rendering one row at a time by a streaming response?
  const streaming = options?.streaming ?? false

  // We should only use estimated minWidth if you are streaming
  let minWidth
  if (!streaming && options?.minWidth === undefined) {
    minWidth = MAX_TIMESTAMP_LENGTH
  } else {
    minWidth = options?.minWidth
  }

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
