/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MathUtils } from './math'

type SizeSuffix = { B: string; KB: string; MB: string; GB: string; TB: string; PB: string }

const fileSizeSuffix: SizeSuffix = { B: 'B', KB: 'KB', MB: 'MB', GB: 'GB', TB: 'TB', PB: 'PB' }
const hashRateSuffix: SizeSuffix = { B: 'H', KB: 'KH', MB: 'MH', GB: 'GH', TB: 'TH', PB: 'PH' }

const memorySizeSuffix: SizeSuffix = {
  B: 'B',
  KB: 'KiB',
  MB: 'MiB',
  GB: 'GiB',
  TB: 'TiB',
  PB: 'PiB',
}

const formatSize = (bytes: number, base: number, suffix: SizeSuffix): string => {
  if (bytes < Math.pow(base, 1)) {
    return `${bytes.toFixed(0)} ${suffix.B}`
  }
  if (bytes < Math.pow(base, 2)) {
    return MathUtils.floor(bytes / Math.pow(base, 1), 2).toFixed(2) + ` ${suffix.KB}`
  }
  if (bytes < Math.pow(base, 3)) {
    return MathUtils.floor(bytes / Math.pow(base, 2), 2).toFixed(2) + ` ${suffix.MB}`
  }
  if (bytes < Math.pow(base, 4)) {
    return MathUtils.floor(bytes / Math.pow(base, 3), 2).toFixed(2) + ` ${suffix.GB}`
  }
  if (bytes < Math.pow(base, 5)) {
    return MathUtils.floor(bytes / Math.pow(base, 4), 2).toFixed(2) + ` ${suffix.TB}`
  }

  return MathUtils.floor(bytes / Math.pow(base, 5), 2).toFixed(2) + ` ${suffix.PB}`
}

const formatFileSize = (bytes: number): string => {
  return formatSize(bytes, 1000, fileSizeSuffix)
}

const formatMemorySize = (bytes: number): string => {
  return formatSize(bytes, 1024, memorySizeSuffix)
}

const formatHashRate = (bytes: number): string => {
  return formatSize(bytes, 1000, hashRateSuffix)
}

export const FileUtils = { formatFileSize, formatMemorySize, formatHashRate }
