/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from './file'
import { TimeUtils } from './time'

type SegmentResults = {
  time: number
  heap: number
  rss: number
  mem: number
}

type Segment = {
  time: HRTime
  heap: number
  rss: number
  mem: number
}

export type HRTime = [seconds: number, nanoseconds: number]

function startTime(): HRTime {
  return process.hrtime()
}

/**
 * @returns milliseconds since start
 */
function endTime(start: HRTime): number {
  const [sec, nanosec] = process.hrtime(start)
  return sec * 1000 + nanosec / 1e6
}

function diffTime(startTime: HRTime, endTime: HRTime): number {
  const [secStart, nanosecStart] = startTime
  const [secEnd, nanosecEnd] = endTime

  const start = secStart * 1000 + nanosecStart / 1e6
  const end = secEnd * 1000 + nanosecEnd / 1e6

  return end - start
}

function getSegment(): Segment {
  const time = startTime()

  if (global.gc) {
    // Need to mark and sweep multiple times to try to collect all of it. You
    // could also just continue to do this until memory stabilizes but this
    // is good enough.
    for (let i = 0; i < 5; ++i) {
      global.gc()
    }
  }

  const startMem = process.memoryUsage()
  const heap = startMem.heapUsed
  const rss = startMem.rss
  const mem = heap + rss

  return { time, heap, rss, mem }
}

function startSegment(): Segment {
  return getSegment()
}

function endSegment(start: Segment): SegmentResults {
  const end = getSegment()

  return {
    time: diffTime(start.time, end.time),
    heap: end.heap - start.heap,
    rss: end.rss - start.rss,
    mem: end.mem - start.mem,
  }
}

function renderSegment(segment: SegmentResults, title = 'Benchmark', delimiter = ', '): string {
  const result = []

  result.push(`Time: ${TimeUtils.renderSpan(segment.time)}`)
  result.push(`Heap: ${FileUtils.formatMemorySize(segment.heap)}`)
  result.push(`RSS: ${FileUtils.formatMemorySize(segment.rss)}`)
  result.push(`Mem: ${FileUtils.formatMemorySize(segment.mem)}`)

  let rendered = result.join(delimiter)

  if (title) {
    rendered = `${title} - ` + rendered
  }

  return rendered
}

async function withSegment(fn: () => Promise<void> | void): Promise<SegmentResults> {
  const segment = startSegment()
  await fn()
  return endSegment(segment)
}

export const BenchUtils = {
  start: startTime,
  end: endTime,
  startSegment,
  endSegment,
  renderSegment,
  withSegment,
}
