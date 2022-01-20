/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from './file'

describe('FileUtils', () => {
  it('format files', () => {
    expect(FileUtils.formatFileSize(/*               */ 1)).toEqual('1 B')
    expect(FileUtils.formatFileSize(/*             */ 999)).toEqual('999 B')
    expect(FileUtils.formatFileSize(/*            */ 1000)).toEqual('1.00 KB')
    expect(FileUtils.formatFileSize(/*          */ 999999)).toEqual('999.99 KB')
    expect(FileUtils.formatFileSize(/*         */ 1000000)).toEqual('1.00 MB')
    expect(FileUtils.formatFileSize(/*       */ 999999999)).toEqual('999.99 MB')
    expect(FileUtils.formatFileSize(/*      */ 1000000000)).toEqual('1.00 GB')
    expect(FileUtils.formatFileSize(/*   */ 1000000000000)).toEqual('1.00 TB')
    expect(FileUtils.formatFileSize(/* */ 999999999999999)).toEqual('999.99 TB')
    expect(FileUtils.formatFileSize(/**/ 1000000000000000)).toEqual('1.00 PB')
  })

  it('format hash rate', () => {
    expect(FileUtils.formatHashRate(/*               */ 1)).toEqual('1 H')
    expect(FileUtils.formatHashRate(/*             */ 999)).toEqual('999 H')
    expect(FileUtils.formatHashRate(/*            */ 1000)).toEqual('1.00 KH')
    expect(FileUtils.formatHashRate(/*          */ 999999)).toEqual('999.99 KH')
    expect(FileUtils.formatHashRate(/*         */ 1000000)).toEqual('1.00 MH')
    expect(FileUtils.formatHashRate(/*       */ 999999999)).toEqual('999.99 MH')
    expect(FileUtils.formatHashRate(/*      */ 1000000000)).toEqual('1.00 GH')
    expect(FileUtils.formatHashRate(/*   */ 1000000000000)).toEqual('1.00 TH')
    expect(FileUtils.formatHashRate(/* */ 999999999999999)).toEqual('999.99 TH')
    expect(FileUtils.formatHashRate(/**/ 1000000000000000)).toEqual('1.00 PH')
  })

  it('format memory', () => {
    expect(FileUtils.formatMemorySize(/*                   */ 1)).toEqual('1 B')
    expect(FileUtils.formatMemorySize(/*                */ 1023)).toEqual('1023 B')
    expect(FileUtils.formatMemorySize(/*                */ 1024)).toEqual('1.00 KiB')
    expect(FileUtils.formatMemorySize(/*             */ 1048575)).toEqual('1023.99 KiB')
    expect(FileUtils.formatMemorySize(/*             */ 1048576)).toEqual('1.00 MiB')
    expect(FileUtils.formatMemorySize(/*          */ 1073741823)).toEqual('1023.99 MiB')
    expect(FileUtils.formatMemorySize(/*          */ 1073741824)).toEqual('1.00 GiB')
    expect(FileUtils.formatMemorySize(/*       */ 1099511627776)).toEqual('1.00 TiB')
    expect(FileUtils.formatMemorySize(/**/ 1.125899906842623e15)).toEqual('1023.99 TiB')
    expect(FileUtils.formatMemorySize(/**/ 1.125899906842624e15)).toEqual('1.00 PiB')
  })
})
