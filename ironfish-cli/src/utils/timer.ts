/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger, RawTransaction, TimeUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { ProgressBar } from '../types'

export class TransactionTimer {
  private logger: Logger
  private progressBar: ProgressBar | undefined
  private startTime: number | undefined
  private estimateInMs: number
  private timer: NodeJS.Timer | undefined

  constructor(spendPostTime: number, raw: RawTransaction, logger?: Logger) {
    this.logger = logger ?? createRootLogger()
    this.estimateInMs = Math.max(Math.ceil(spendPostTime * raw.spends.length), 1000)
  }

  displayEstimate() {
    this.logger.log(
      `Time to send: ${TimeUtils.renderSpan(this.estimateInMs, {
        hideMilliseconds: true,
      })}`,
    )
  }

  start() {
    this.progressBar = CliUx.ux.progress({
      format: '{title}: [{bar}] {percentage}% | {estimate}',
    }) as ProgressBar

    this.startTime = Date.now()

    this.progressBar.start(100, 0, {
      title: 'Sending the transaction',
      estimate: TimeUtils.renderSpan(this.estimateInMs, { hideMilliseconds: true }),
    })

    this.timer = setInterval(() => {
      if (!this.progressBar || !this.startTime) {
        return
      }
      const durationInMs = Date.now() - this.startTime
      const timeRemaining = this.estimateInMs - durationInMs
      const progress = Math.round((durationInMs / this.estimateInMs) * 100)

      this.progressBar.update(progress, {
        estimate: TimeUtils.renderSpan(timeRemaining, { hideMilliseconds: true }),
      })
    }, 1000)
  }

  end() {
    if (!this.progressBar || !this.startTime || !this.timer) {
      return
    }

    clearInterval(this.timer)
    this.progressBar.update(100)
    this.progressBar.stop()

    this.logger.log(
      `Sending took ${TimeUtils.renderSpan(Date.now() - this.startTime, {
        hideMilliseconds: true,
      })}`,
    )
  }
}
