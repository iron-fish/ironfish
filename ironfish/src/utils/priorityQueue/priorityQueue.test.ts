/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomBytes, randomInt } from 'crypto'
import { PriorityQueue } from './'
import { Action, heapSort, Return, SimpleQueue } from './priorityQueueTestHelpers'

const compareStringNumber = (a: [string, number], b: [string, number]) => {
  return a[1] === b[1] ? a[0].localeCompare(b[0]) < 0 : a[1] < b[1]
}

describe('Priority Queue', () => {
  it('polls items in the correct order', () => {
    const items: [string, number][] = [
      ['0', 27],
      ['1', 99],
      ['2', 55],
      ['3', 47],
      ['4', 72],
      ['5', 26],
      ['6', 88],
      ['7', 49],
      ['8', 46],
      ['9', 75],
    ]

    const queue = new PriorityQueue<[string, number]>(compareStringNumber, (a) => a[0])

    for (const item of items) {
      queue.add(item)
    }

    const resultsFromSorted = [...queue.sorted()]

    const results: [string, number][] = []
    while (queue.size() > 0) {
      const next = queue.poll()
      next && results.push(next)
    }

    expect(results).toEqual([
      ['5', 26],
      ['0', 27],
      ['8', 46],
      ['3', 47],
      ['7', 49],
      ['2', 55],
      ['4', 72],
      ['9', 75],
      ['6', 88],
      ['1', 99],
    ])

    expect(results).toEqual(resultsFromSorted)
  })

  it('adds removes and polls items in order correctly', () => {
    const items: [string, number][] = [
      ['0', 4],
      ['1', 18],
      ['2', 55],
      ['3', 74],
      ['4', 89],
      ['5', 37],
      ['6', 32],
      ['7', 8],
      ['8', 0],
      ['9', 16],
    ]

    const queue = new PriorityQueue<[string, number]>(compareStringNumber, (a) => a[0])

    for (const item of items) {
      queue.add(item)
    }

    for (const item of items.slice(0, 5)) {
      queue.remove(queue.hash(item))
    }

    const resultsFromSorted = [...queue.sorted()]

    const results: [string, number][] = []
    while (queue.size() > 0) {
      const next = queue.poll()
      next && results.push(next)
    }

    expect(results).toEqual([
      ['8', 0],
      ['7', 8],
      ['9', 16],
      ['6', 32],
      ['5', 37],
    ])

    expect(results).toEqual(resultsFromSorted)
  })

  it('sorts random elements via `add` and `poll` correctly', () => {
    const randomItems: [string, number][] = [...new Array(1000)].map((_, i) => [
      i.toString(),
      randomInt(0, 10000),
    ])

    const compare = (a: [string, number], b: [string, number]) => {
      return a[1] === b[1] ? a[0].localeCompare(b[0]) < 0 : a[1] < b[1]
    }

    const queue = new PriorityQueue<[string, number]>(compare, (a) => a[0])
    const simpleQueue = new SimpleQueue<[string, number]>(compare, (a) => a[0])

    expect(heapSort(queue, randomItems)).toEqual(heapSort(simpleQueue, randomItems))
  })

  it('does multiple random `add`, `remove`, `poll` actions with the same result', () => {
    // A random item is only 20 bytes so there could be collisions
    // it's a good thing that we test possible collisions
    const randomItem: () => [string, number] = () => [
      randomBytes(20).toString('hex'),
      randomInt(0, 10000),
    ]

    // Do 100 random actions, either an `add`, `remove` or `poll` and append the results
    const actions: Action<[string, number]>[] = [...new Array(100)].map((_) => {
      const action = randomInt(0, 2)
      if (action === 0) {
        // Add a random number of random items and return the result of `add`
        const toAdd = [...new Array(randomInt(0, 100))].map((_) => randomItem())
        return (queue) => toAdd.map((item) => ({ a: 'ADD', r: queue.add(item) }))
      } else if (action === 1) {
        // Poll a random number of items and return the result of `poll`
        const toPoll = randomInt(0, 100)
        return (queue) => [...new Array(toPoll)].map((_) => ({ a: 'POLL', r: queue.poll() }))
      } else {
        // Remove a random number of random items and return the result of `remove`
        const toRemove = [...new Array(randomInt(0, 100))].map((_) => randomItem())
        return (queue) =>
          toRemove.map((item) => ({ a: 'REMOVE', r: queue.remove(queue.hash(item)) }))
      }
    })

    // Poll the remaining items in the queue to make sure the queue state are equivalent at the end
    actions.push((queue) => {
      const results: Return<[string, number]>[] = []

      while (queue.size()) {
        results.push({ a: 'POLL', r: queue.poll() })
      }

      return results
    })

    const compare = (a: [string, number], b: [string, number]) => {
      return a[1] === b[1] ? a[0].localeCompare(b[0]) < 0 : a[1] < b[1]
    }

    const queue = new PriorityQueue<[string, number]>(compare, (a) => a[0])
    const simpleQueue = new SimpleQueue<[string, number]>(compare, (a) => a[0])

    const queueResults = actions.flatMap((action) => action(queue))
    const simpleQueueResults = actions.flatMap((action) => action(simpleQueue))

    expect(queueResults).toEqual(simpleQueueResults)
  })
})
