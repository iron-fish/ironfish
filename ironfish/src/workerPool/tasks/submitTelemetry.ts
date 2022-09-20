/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Tag } from '../../telemetry'
import { Metric } from '../../telemetry/interfaces/metric'
import { GraffitiUtils } from '../../utils/graffiti'
import { WebApi } from '../../webApi'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class SubmitTelemetryRequest extends WorkerMessage {
  readonly points: Metric[]
  readonly graffiti: Buffer

  constructor(points: Metric[], graffiti: Buffer, jobId?: number) {
    super(WorkerMessageType.SubmitTelemetry, jobId)
    this.points = points
    this.graffiti = graffiti
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.graffiti)
    bw.writeU64(this.points.length)

    for (const point of this.points) {
      bw.writeVarString(point.measurement)
      bw.writeVarString(point.timestamp.toISOString())

      const { fields } = point
      bw.writeU64(fields.length)
      for (const field of fields) {
        bw.writeVarString(field.name)
        bw.writeVarString(field.type)
        switch (field.type) {
          case 'string':
            bw.writeVarString(field.value)
            break
          case 'boolean':
            bw.writeU8(Number(field.value))
            break
          case 'float':
            bw.writeDouble(field.value)
            break
          case 'integer':
            bw.writeU64(field.value)
            break
        }
      }

      const tags = point.tags
      if (tags) {
        bw.writeU64(tags.length)
        for (const tag of tags) {
          bw.writeVarString(tag.name)
          bw.writeVarString(tag.value)
        }
      }
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): SubmitTelemetryRequest {
    const reader = bufio.read(buffer, true)
    const graffiti = reader.readVarBytes()
    const pointsLength = reader.readU64()
    const points = []
    for (let i = 0; i < pointsLength; i++) {
      const measurement = reader.readVarString()
      const timestamp = new Date(reader.readVarString())

      const fieldsLength = reader.readU64()
      const fields = []
      for (let j = 0; j < fieldsLength; j++) {
        const name = reader.readVarString()
        const type = reader.readVarString()
        switch (type) {
          case 'string': {
            const value = reader.readVarString()
            fields.push({ name, type, value })
            break
          }
          case 'boolean': {
            const value = Boolean(reader.readU8())
            fields.push({ name, type, value })
            break
          }
          case 'float': {
            const value = reader.readDouble()
            fields.push({ name, type, value })
            break
          }
          case 'integer': {
            const value = reader.readU64()
            fields.push({ name, type, value })
            break
          }
          default:
            throw new Error(`Invalid type: '${type}'`)
        }
      }

      let tags: Tag[] | undefined
      if (reader.left()) {
        const tagsLength = reader.readU64()
        tags = []
        for (let k = 0; k < tagsLength; k++) {
          const name = reader.readVarString()
          const value = reader.readVarString()
          tags.push({ name, value })
        }
      }

      points.push({ measurement, tags, timestamp, fields })
    }
    return new SubmitTelemetryRequest(points, graffiti, jobId)
  }

  getSize(): number {
    let size = 8 + bufio.sizeVarBytes(this.graffiti)
    for (const point of this.points) {
      size += bufio.sizeVarString(point.measurement)
      size += bufio.sizeVarString(point.timestamp.toISOString())

      size += 8
      for (const field of point.fields) {
        size += bufio.sizeVarString(field.name)
        size += bufio.sizeVarString(field.type)
        switch (field.type) {
          case 'string':
            size += bufio.sizeVarString(field.value)
            break
          case 'boolean':
            size += 1
            break
          case 'float':
          case 'integer':
            size += 8
            break
        }
      }

      const tags = point.tags
      if (tags) {
        size += 8
        for (const tag of tags) {
          size += bufio.sizeVarString(tag.name)
          size += bufio.sizeVarString(tag.value)
        }
      }
    }
    return size
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

  async execute({
    jobId,
    points,
    graffiti,
  }: SubmitTelemetryRequest): Promise<SubmitTelemetryResponse> {
    const api = new WebApi()
    await api.submitTelemetry({ points, graffiti: GraffitiUtils.toHuman(graffiti) })
    return new SubmitTelemetryResponse(jobId)
  }
}
