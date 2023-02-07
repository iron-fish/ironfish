/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ASSET_NAME_LENGTH } from '@ironfish/rust-nodejs'
import { Assert, BufferUtils, TimeUtils } from '@ironfish/sdk'
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

const MAX_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH + 1
const MIN_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH / 2 + 1

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
  if (streaming && options?.minWidth === undefined) {
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

const asset = <T extends Record<string, unknown>>(options?: {
  extended?: boolean
}): Partial<Record<string, table.Column<T>>> => {
  if (options?.extended) {
    return {
      assetId: {
        header: 'Asset ID',
        get: (row) => row['assetId'],
        minWidth: MAX_ASSET_NAME_COLUMN_WIDTH,
        extended: true,
      },
      assetName: {
        header: 'Asset Name',
        get: (row) => {
          Assert.isString(row.assetName)
          const assetName = BufferUtils.toHuman(Buffer.from(row.assetName, 'hex'))
          return truncateCol(assetName, MAX_ASSET_NAME_COLUMN_WIDTH)
        },
        minWidth: MAX_ASSET_NAME_COLUMN_WIDTH,
        extended: true,
      },
    }
  } else {
    return {
      asset: {
        header: 'Asset',
        get: (row) => {
          Assert.isString(row.assetName)
          Assert.isString(row.assetId)
          const assetName = truncateCol(
            BufferUtils.toHuman(Buffer.from(row.assetName, 'hex')),
            MIN_ASSET_NAME_COLUMN_WIDTH,
          )
          const text = assetName.padEnd(MIN_ASSET_NAME_COLUMN_WIDTH, ' ')
          return `${text} (${row.assetId.slice(0, 5)})`
        },
        minWidth: MIN_ASSET_NAME_COLUMN_WIDTH,
        extended: false,
      },
    }
  }
}

export function truncateCol(value: string, maxWidth: number | null): string {
  if (maxWidth === null || value.length <= maxWidth) {
    return value
  }

  return value.slice(0, maxWidth - 1) + '…'
}

export const TableCols = { timestamp, asset }
