/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
type SizeSuffix = { B: string; KB: string; MB: string; GB: string }

const fileSizeSuffix: SizeSuffix = { B: 'B', KB: 'KB', MB: 'MB', GB: 'GB' }
const memorySizeSuffix: SizeSuffix = { B: 'B', KB: 'KiB', MB: 'MiB', GB: 'GiB' }

const formatFileSize = (
  bytes: number,
  base = 1000,
  suffix: SizeSuffix = fileSizeSuffix,
): string => {
  if (bytes < Math.pow(base, 1)) return `${bytes.toFixed(0)} ${suffix.B}`
  if (bytes < Math.pow(base, 2)) return (bytes / Math.pow(base, 1)).toFixed(0) + ` ${suffix.KB}`
  if (bytes < Math.pow(base, 3)) return (bytes / Math.pow(base, 2)).toFixed(2) + ` ${suffix.MB}`
  else return (bytes / Math.pow(base, 3)).toFixed(2) + ` ${suffix.GB}`
}

const formatMemorySize = (bytes: number): string => {
  return formatFileSize(bytes, 1024, memorySizeSuffix)
}

export const FileUtils = { formatFileSize, formatMemorySize }
