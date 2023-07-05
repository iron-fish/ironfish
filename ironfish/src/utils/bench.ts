/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from './file'
import { MathUtils } from './math'
import { TimeUtils } from './time'

export type SegmentResults = {
  time: number
  heap: number
  rss: number
  mem: number
}

type Aggregate = {
  min: number
  max: number
  avg: number
  median: number
}

export type SegmentAggregateResults = {
  iterations: number
  time: Aggregate
  heap: Aggregate
  rss: Aggregate
  mem: Aggregate
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

  result.push(`Timespan: ${TimeUtils.renderSpan(segment.time)}`)
  result.push(`Heap: ${FileUtils.formatMemorySize(segment.heap)}`)
  result.push(`RSS: ${FileUtils.formatMemorySize(segment.rss)}`)
  result.push(`Mem: ${FileUtils.formatMemorySize(segment.mem)}`)

  let rendered = result.join(delimiter)

  if (title) {
    rendered = `${title} - ` + rendered
  }

  return rendered
}

function renderSegmentAggregate(
  segmentAggregate: SegmentAggregateResults,
  title = 'Benchmark',
  delimiter = '\n',
): string {
  const result = []

  const renderAggregate = (
    name: string,
    aggregate: Aggregate,
    renderFn: (arg: number) => string,
  ): string => {
    return `${name}: min: ${renderFn(aggregate.min)}, avg: ${renderFn(
      aggregate.avg,
    )}, median: ${renderFn(aggregate.median)}, max ${renderFn(aggregate.max)}`
  }

  result.push(`Iterations: ${segmentAggregate.iterations}`)
  result.push(renderAggregate('Time', segmentAggregate.time, TimeUtils.renderSpan))
  result.push(renderAggregate('Heap', segmentAggregate.heap, FileUtils.formatMemorySize))
  result.push(renderAggregate('Rss', segmentAggregate.rss, FileUtils.formatMemorySize))
  result.push(renderAggregate('Mem', segmentAggregate.mem, FileUtils.formatMemorySize))

  let rendered = result.join(delimiter)

  if (title) {
    rendered = `${title}` + delimiter + rendered
  }

  return rendered
}

async function withSegment(fn: () => Promise<void> | void): Promise<SegmentResults> {
  const segment = startSegment()
  await fn()
  return endSegment(segment)
}

async function withSegmentIterations(
  warmupIterations: number,
  testIterations: number,
  fn: () => Promise<void> | void,
): Promise<SegmentAggregateResults> {
  for (let i = 0; i < warmupIterations; i++) {
    await fn()
  }

  const results: Array<SegmentResults> = []
  for (let i = 0; i < testIterations; i++) {
    results.push(await withSegment(fn))
  }

  return aggregateResults(results)
}

function aggregateResults(results: SegmentResults[]): SegmentAggregateResults {
  const assignResults = (key: Aggregate, sortedArray: number[]) => {
    key.min = sortedArray[0]
    key.max = sortedArray[time.length - 1]
    key.avg = MathUtils.arrayAverage(sortedArray)
    key.median = MathUtils.arrayMedian(sortedArray, true)
  }

  const aggregateResults: SegmentAggregateResults = {
    iterations: results.length,
    time: { min: 0, max: 0, avg: 0, median: 0 },
    heap: { min: 0, max: 0, avg: 0, median: 0 },
    rss: { min: 0, max: 0, avg: 0, median: 0 },
    mem: { min: 0, max: 0, avg: 0, median: 0 },
  }

  const time = results.map((r) => r.time).sort()
  const heap = results.map((r) => r.heap).sort()
  const rss = results.map((r) => r.rss).sort()
  const mem = results.map((r) => r.mem).sort()

  assignResults(aggregateResults.time, time)
  assignResults(aggregateResults.heap, heap)
  assignResults(aggregateResults.rss, rss)
  assignResults(aggregateResults.mem, mem)

  return aggregateResults
}

export const BenchUtils = {
  start: startTime,
  end: endTime,
  startSegment,
  endSegment,
  renderSegment,
  renderSegmentAggregate,
  withSegment,
  withSegmentIterations,
}
