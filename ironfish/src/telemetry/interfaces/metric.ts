/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Field } from './field'
import { Tag } from './tag'

/**
 * A specific datapoint being collected.
 */
export interface Metric {
  /**
   * A description for the container that the fields measure. This is equivilent
   * to a SQL table.
   */
  measurement: string

  /**
   * The exact time at which the metric was recorded.
   * JS gives us millisecond accuracy here.
   * Defaults to new Date() if not specified
   */
  timestamp?: Date

  /**
   * Collection of string keys and values to help identify
   * this metric.
   *
   * Expected values will be something like: "client_id": "xxx"
   * or "version": "xxx".
   */
  tags?: Tag[]

  /**
   * Array of measured values for this particular measurement.
   * There must be at least one field.
   * Each field has a name, type, and a single value.
   */
  fields: Field[]
}
