/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MathUtils } from './math'

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
  const estimate = (remaining / speed) * 1000

  if (speed <= 0) {
    return 'N/A'
  }

  if (estimate < 1000) {
    return 'soon'
  }

  return renderSpan(estimate, {
    forceMillisecond: false,
    forceSecond: true,
    forceMinute: true,
    forceHour: true,
    hideMilliseconds: true,
  })
}

/**
 * @param time time in milliseconds
 */
const renderSpan = (
  time: number,
  options?: {
    forceHour?: boolean
    forceMinute?: boolean
    forceSecond?: boolean
    forceMillisecond?: boolean
    hideMilliseconds?: boolean
  },
): string => {
  if (time < 1) {
    return `${MathUtils.round(time, 4)}ms`
  }

  const parts = []
  let magnitude = 0

  if (time >= MS_PER_HOUR && (magnitude <= 5 || options?.forceHour)) {
    const hours = Math.floor(time / MS_PER_HOUR)
    time -= hours * MS_PER_HOUR
    parts.push(`${hours.toFixed(0)}h`)
    magnitude = Math.max(magnitude, 4)
  }

  if (time >= MS_PER_MIN && (magnitude <= 4 || options?.forceMinute)) {
    const minutes = Math.floor(time / MS_PER_MIN)
    time -= minutes * MS_PER_MIN
    parts.push(`${minutes.toFixed(0)}m`)
    magnitude = Math.max(magnitude, 3)
  }

  if (time >= MS_PER_SEC && (magnitude <= 3 || options?.forceSecond)) {
    const seconds = Math.floor(time / MS_PER_SEC)
    time -= seconds * MS_PER_SEC
    parts.push(`${seconds.toFixed(0)}s`)
    magnitude = Math.max(magnitude, 2)
  }

  if (time > 0 && (magnitude <= 2 || options?.forceMillisecond)) {
    if (!options?.hideMilliseconds) {
      if (magnitude === 0) {
        parts.push(`${MathUtils.round(time, 4)}ms`)
      } else {
        parts.push(`${time.toFixed(0)}ms`)
      }
    }
    magnitude = Math.max(magnitude, 1)
  }

  return parts.join(' ')
}

export const TimeUtils = { renderEstimate, renderSpan }
