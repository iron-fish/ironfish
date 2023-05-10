/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '@ironfish/sdk'
import chalk from 'chalk'
import * as yup from 'yup'

/**
 * Type alias for the supported child processes of a SimulationNode.
 * The 'node' process runs the underlying Ironfish node.
 * The 'miner' process runs an optional miner against the node.
 */
export type supportedNodeChildProcesses = 'miner' | 'node'

/**
 * The default onLog handler for a SimulationNode. It logs the log event to the console.
 *
 * @param logger The logger used to log the event
 */
export const defaultOnLog =
  (logger: Logger) =>
  (event: LogEvent): void => {
    logger.log(`[${event.node}:${event.proc}:log:${event.type}] ${JSON.stringify(event)}`)
  }

/**
 * The default onExit handler for a SimulationNode. It logs the exit event, in red, to the console.
 *
 * @param logger The logger used to log the event
 */
export const defaultOnExit =
  (logger: Logger) =>
  (event: ExitEvent): void =>
    logger.log(chalk.red(`[${event.node}:exit]`) + ` ${JSON.stringify(event)}`)

/**
 *  defaultOnError is the default onError handler for a SimulationNode. It logs the error event, in red, to the console.
 *
 * @param logger The logger used to log the event
 */
export const defaultOnError =
  (logger: Logger) =>
  (event: ErrorEvent): void =>
    logger.log(chalk.red(`[${event.node}:error]`) + ` ${JSON.stringify(event)}`)

/**
 * LogEvent that is emitted to any `onLog` listeners when a child process writes to stdout or stderr.
 */
export type LogEvent = {
  node: string
  type: 'stdout' | 'stderr'
  proc: supportedNodeChildProcesses
  message: string
  jsonMessage?: NodeLogEvent
  timestamp: string
}

/**
 * Formats a LogEvent into a pretty string.
 */
export function logEventToString(l: LogEvent): string {
  const msg = {
    node: l.node,
    proc: l.proc,
    type: l.type,
    message: l.jsonMessage,
    timestamp: l.timestamp,
  }

  if (msg.message === undefined) {
    return ''
  }

  return JSON.stringify(msg, undefined, 2)
}

/**
 * NodeLogEvent is the JSON object that is logged by the Ironfish node.
 * This is wrapped in a LogEvent when it is emitted to any listeners.
 */
export type NodeLogEvent = {
  date: string
  level: string
  message: string
  tag: string
}

/**
 * NodeLogEventSchema is the schema for a NodeLogEvent. This is used to validate that the JSON
 * object that is logged by the Ironfish node is valid.
 */
export const NodeLogEventSchema: yup.ObjectSchema<NodeLogEvent> = yup
  .object({
    date: yup.string().required(),
    level: yup.string().required(),
    message: yup.string().required(),
    tag: yup.string().required(),
  })
  .required()

/**
 * CloseEvent is emitted to any `onClose` listeners when a child process is closed.
 */
export type CloseEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  timestamp: string
}

/**
 * ExitEvent is emitted to any `onExit` listeners when a child process exits.
 */
export type ExitEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  signal: NodeJS.Signals | null
  lastErr: Error | undefined
  timestamp: string
}

/**
 * ErrorEvent is emitted to any `onError` listeners when a child process emits an error.
 */
export type ErrorEvent = {
  node: string
  proc: supportedNodeChildProcesses
  error: Error
  timestamp: string
}
