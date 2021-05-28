/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MS_PER_SEC = 1000.0
const MS_PER_MIN = 60.0 * 1000.0
const MS_PER_HOUR = 60.0 * 60.0 * 1000.0

/**
 *
 * @param done how many items have been completed
 * @param total how many items are there total
 * @param speed the current speed in items per second
 */
const renderEstimate = (done: number, total: number, speed: number): string => {
  const remaining = total - done
  let estimateSec = (remaining / speed) * 1000

  if (speed <= 0) {
    return 'N/A'
  }

  if (estimateSec < 1000) {
    return 'soon'
  }

  if (estimateSec < MS_PER_MIN) {
    const seconds = Math.floor(estimateSec / MS_PER_SEC)
    return `${seconds.toFixed(0)}s`
  }

  if (estimateSec < MS_PER_HOUR) {
    const minutes = Math.floor(estimateSec / MS_PER_MIN)
    estimateSec -= minutes * MS_PER_MIN
    const seconds = estimateSec / MS_PER_SEC
    return `${minutes.toFixed(0)}m ${seconds.toFixed(0)}s`
  }

  const hours = Math.floor(estimateSec / MS_PER_HOUR)
  estimateSec -= hours * MS_PER_HOUR
  const minutes = Math.floor(estimateSec / MS_PER_MIN)
  estimateSec -= minutes * MS_PER_MIN
  const seconds = Math.floor(estimateSec / MS_PER_SEC)

  return `${hours.toFixed(0)}h ${minutes.toFixed(0)}m ${seconds.toFixed(0)}s`
}

export const TimeUtils = { renderEstimate }
