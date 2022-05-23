/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Job } from '../job'
import type { WorkerMessage } from './workerMessage'

export abstract class WorkerTask {
  abstract execute(request: WorkerMessage, job: Job): WorkerMessage | Promise<WorkerMessage>
}
