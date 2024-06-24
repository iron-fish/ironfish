/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert, Meter, TimeUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import chalk from 'chalk'
import * as cliProgress from 'cli-progress'
import inquirer from 'inquirer'
import stringWidth from 'string-width'

const progressBarCompleteChar = '\u2588'
const progressBarIncompleteChar = '\u2591'
const WIDE_DASH = '─'

export const ProgressBarPresets = {
  basic: {
    barCompleteChar: progressBarCompleteChar,
    barIncompleteChar: progressBarIncompleteChar,
    format: '{title}: [{bar}] {percentage}% | ETA: {estimate}',
  },
  default: {
    barCompleteChar: progressBarCompleteChar,
    barIncompleteChar: progressBarIncompleteChar,
    format:
      '{title}: [{bar}] {percentage}% | {formattedValue} / {formattedTotal} | ETA: {estimate}',
  },
  withSpeed: {
    barCompleteChar: progressBarCompleteChar,
    barIncompleteChar: progressBarIncompleteChar,
    format:
      '{title}: [{bar}] {percentage}% | {formattedValue} / {formattedTotal} | {speed} / sec | ETA: {estimate}',
  },
}

export class ProgressBar {
  bar: cliProgress.SingleBar
  meter: Meter
  preset: cliProgress.Preset
  formatFn: ((value: number) => string) | undefined = undefined

  lastValue: number = 0
  title: string
  total: number = 0

  constructor(
    title: string,
    options?: {
      preset?: cliProgress.Preset
      formatFn?: (value: number) => string
    },
  ) {
    this.preset = options?.preset || ProgressBarPresets.default
    this.formatFn = options?.formatFn

    this.bar = new cliProgress.SingleBar({}, this.preset)
    this.meter = new Meter()

    this.title = title
  }

  start(total: number, start: number, payload?: Record<string, unknown> | undefined): void {
    this.total = total

    if (payload && payload.title) {
      Assert.isString(payload.title)
      this.title = payload.title
    }

    const fullPayload = {
      estimate: TimeUtils.renderEstimate(0, 0, 0),
      formattedTotal: this.formatFn ? this.formatFn(total) : total,
      formattedValue: this.formatFn ? this.formatFn(start) : start,
      speed: this.formatFn ? this.formatFn(0) : '0',
      title: this.title,
      ...payload,
    }

    this.bar.start(total, start, fullPayload)
    this.meter.start()
  }

  update(currentValue: number, payload?: object): void {
    const valueDiff = currentValue - this.lastValue
    this.meter.add(valueDiff)

    const speed = this.formatFn
      ? this.formatFn(this.meter.rate1s)
      : this.meter.rate1s.toFixed(2)

    const fullPayload = {
      estimate: TimeUtils.renderEstimate(currentValue, this.total, this.meter.rate1m),
      formattedTotal: this.formatFn ? this.formatFn(this.total) : this.total,
      formattedValue: this.formatFn ? this.formatFn(currentValue) : currentValue,
      speed,
      ...payload,
    }

    this.bar.update(currentValue, fullPayload)
    this.lastValue = currentValue
  }

  stop(): void {
    this.meter.stop()
    this.bar.stop()
  }

  resetMeter(): void {
    this.meter.reset()
  }

  setTotal(total: number): void {
    this.total = total
    this.bar.setTotal(total)
  }
}

export async function confirmPrompt(message: string): Promise<boolean> {
  const result: { prompt: boolean } = await inquirer.prompt({
    type: 'confirm',
    // Add a new-line for readability, manually. If the prefix is set to a new-line, it seems to
    // add a space before the message, which is unwanted.
    message: `\n${message}`,
    name: 'prompt',
    prefix: '',
  })
  return result.prompt
}

export async function confirmOrQuit(message?: string, confirm?: boolean): Promise<void> {
  if (confirm) {
    return
  }

  const confirmed = await confirmPrompt(message || 'Do you confirm?')

  if (!confirmed) {
    ux.log('Operation aborted.')
    ux.exit(0)
  }
}

export interface TableColumn<T extends Record<string, unknown>> {
  // The return type of this function can be extended, it's really just to avoid
  // being `unknown`. Anything that has a `.toString()` function can be added
  // here with no extra changes.
  get(this: void, row: T): string | number | bigint | boolean
  header: string
}

export type TableColumns<T extends Record<string, unknown>> = { [key: string]: TableColumn<T> }

export interface TableOptions {
  [key: string]: unknown
  output?: string
}

export function table<T extends Record<string, unknown>>(
  data: T[],
  columns: TableColumns<T>,
  options: TableOptions,
): void {
  new Table(data, columns, options).render()
}

// TODO(mat): filter
// TODO(mat): sort
// TODO(mat): default value without a getter function?
// TODO(mat): Roll our custom truncate/no-truncate logic into the flags
// TODO(mat): Check other flags
class Table<T extends Record<string, unknown>> {
  data: T[]
  columns: (TableColumn<T> & { key: string; width?: number })[]
  options: TableOptions

  constructor(data: T[], columns: TableColumns<T>, options: TableOptions) {
    this.data = data
    this.columns = Object.entries(columns).map(([key, column]) => {
      return {
        ...column,
        key,
      }
    })
    this.options = {
      output: options.csv ? 'csv' : options.output,
    }
  }

  render() {
    // Generate the rendered text to be displayed
    const rows: Record<string, string>[] = []
    for (const data of this.data) {
      const row: Record<string, string> = {}
      for (const column of this.columns) {
        row[column.key] = column.get(data).toString()
      }
      rows.push(row)
    }

    switch (this.options.output) {
      case 'csv': {
        this.renderCsv(rows)
        break
      }

      case 'json': {
        this.renderJson(rows)
        break
      }

      default: {
        this.renderTerminal(rows)
      }
    }
  }

  renderCsv(rows: Record<string, string>[]) {
    const columnHeaders = []
    for (const column of this.columns) {
      columnHeaders.push(sanitizeCsvValue(column.header))
    }
    console.log(columnHeaders.join(','))

    for (const row of rows) {
      const rowValues = []
      for (const value of Object.values(row)) {
        rowValues.push(sanitizeCsvValue(value))
      }
      console.log(rowValues.join(','))
    }
  }

  renderJson(rows: Record<string, string>[]) {
    console.log(JSON.stringify(rows, null, 2))
  }

  renderTerminal(rows: Record<string, string>[]) {
    // Find column lengths
    for (const column of this.columns) {
      // TODO(mat): This should just be a simple map, and not attached to the
      // column object itself
      column.width = maxColumnLength(column.key, column.header, rows)
    }

    // Print headers
    const columnHeaders = []
    for (const column of this.columns) {
      Assert.isNotUndefined(column.width)
      const spacerLength = column.width - stringWidth(column.header)
      columnHeaders.push(`${column.header}${' '.repeat(spacerLength)}`)
    }
    console.log(chalk.bold('', columnHeaders.join(' ')))

    // Print header underline
    const columnUnderlines = []
    for (const column of this.columns) {
      Assert.isNotUndefined(column.width)
      columnUnderlines.push(WIDE_DASH.repeat(column.width))
    }
    console.log(chalk.bold('', columnUnderlines.join(' ')))

    // Print rows
    for (const row of rows) {
      const rowValues = []
      for (const [key, value] of Object.entries(row)) {
        const column = this.columns.find((c) => c.key === key)
        // TODO(mat): Come up with meaningful messages for all the asserts in this file
        Assert.isNotUndefined(column)
        Assert.isNotUndefined(column.width)
        const spacerLength = column.width - stringWidth(value)
        rowValues.push(`${value}${' '.repeat(spacerLength)}`)
      }
      // TODO(mat): All console.logs will probably be replaced with ux.stdout?
      console.log('', rowValues.join(' '))
    }
  }
}

function maxColumnLength<T extends Record<string, string>>(
  columnName: string,
  columnHeader: string,
  data: T[],
): number {
  let maxLength = stringWidth(columnHeader)
  for (const row of data) {
    const length = stringWidth(row[columnName])
    if (length > maxLength) {
      maxLength = length
    }
  }

  return maxLength
}

function sanitizeCsvValue(value: string): string {
  const newValue = value

  // Double-quotes must be escaped with another double-quote
  newValue.replace('"', '""')

  // If the value contains any of these special characters, it needs to be
  // wrapped in double-quotes
  if (
    newValue.includes('"') ||
    newValue.includes('\r') ||
    newValue.includes('\n') ||
    newValue.includes(',')
  ) {
    return `"${newValue}"`
  }

  return newValue
}
