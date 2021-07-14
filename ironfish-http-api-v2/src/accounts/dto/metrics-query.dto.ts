/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Type } from 'class-transformer'
import { IsDate, IsEnum, ValidateIf } from 'class-validator'
import { MetricsGranularity } from '../enums/metrics-granularity'

export class MetricsQueryDto {
  @ValidateIf((o: MetricsQueryDto) => Boolean(o.end))
  @IsDate()
  @Type(() => Date)
  readonly start?: Date

  @ValidateIf((o: MetricsQueryDto) => Boolean(o.start))
  @IsDate()
  @Type(() => Date)
  readonly end?: Date

  @IsEnum(MetricsGranularity)
  readonly granularity!: MetricsGranularity
}
