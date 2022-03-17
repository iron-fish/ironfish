/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Metric } from '../../telemetry/interfaces/metric'
import { WebApi } from '../../webApi'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class SubmitTelemetryRequest extends WorkerMessage {
  readonly json: string
  readonly points: Metric[]

  constructor(points: Metric[], jobId?: number) {
    super(WorkerMessageType.SubmitTelemetry, jobId)
    this.json = JSON.stringify(points)
    this.points = points
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.json, 'utf8')
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): SubmitTelemetryRequest {
    const reader = bufio.read(buffer, true)
    const json = reader.readVarString('utf8')
    const points = JSON.parse(json) as Metric[]
    return new SubmitTelemetryRequest(points, jobId)
  }

  getSize(): number {
    return bufio.sizeVarString(this.json, 'utf8')
  }
}

export class SubmitTelemetryResponse extends WorkerMessage {
  constructor(jobId: number) {
    super(WorkerMessageType.SubmitTelemetry, jobId)
  }

  serialize(): Buffer {
    return Buffer.from('')
  }

  static deserialize(jobId: number): SubmitTelemetryResponse {
    return new SubmitTelemetryResponse(jobId)
  }

  getSize(): number {
    return 0
  }
}

export class SubmitTelemetryTask extends WorkerTask {
  private static instance: SubmitTelemetryTask | undefined

  static getInstance(): SubmitTelemetryTask {
    if (!SubmitTelemetryTask.instance) {
      SubmitTelemetryTask.instance = new SubmitTelemetryTask()
    }
    return SubmitTelemetryTask.instance
  }

  async execute({ jobId, points }: SubmitTelemetryRequest): Promise<SubmitTelemetryResponse> {
    const api = new WebApi()
    await api.submitTelemetry({ points })
    return new SubmitTelemetryResponse(jobId)
  }
}
