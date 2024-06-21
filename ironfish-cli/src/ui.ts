/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert, Meter, TimeUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import * as cliProgress from 'cli-progress'
import inquirer from 'inquirer'

const progressBarCompleteChar = '\u2588'
const progressBarIncompleteChar = '\u2591'

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
