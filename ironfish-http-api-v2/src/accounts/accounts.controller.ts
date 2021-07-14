/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  NotImplementedException,
  Param,
  ParseIntPipe,
  Query,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common'
import { MS_PER_DAY } from '../common/constants'
import { AccountsService } from './accounts.service'
import { MetricsQueryDto } from './dto/metrics-query.dto'
import { MetricsGranularity } from './enums/metrics-granularity'
import { Account } from '.prisma/client'

const MAX_SUPPORTED_TIME_RANGE_IN_DAYS = 30

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get(':id')
  async find(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    id: number,
  ): Promise<Account> {
    const account = await this.accountsService.find({ id })
    if (!account) {
      throw new NotFoundException()
    }
    return account
  }

  @Get(':id/metrics')
  async metrics(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    id: number,
    @Query(
      new ValidationPipe({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        transform: true,
      }),
    )
    query: MetricsQueryDto,
  ): Promise<void> {
    const { isValid, error } = this.isValidMetricsQuery(query)
    if (!isValid) {
      throw new UnprocessableEntityException(error)
    }
    const account = await this.accountsService.find({ id })
    if (!account) {
      throw new NotFoundException()
    }
    throw new NotImplementedException()
  }

  private isValidMetricsQuery({ start, end, granularity }: MetricsQueryDto): {
    isValid: boolean
    error?: string
  } {
    if (start !== undefined && end !== undefined) {
      if (granularity === MetricsGranularity.LIFETIME) {
        return {
          isValid: false,
          error: 'Cannot provide time range for "LIFETIME" requests',
        }
      }
      if (start >= end) {
        return {
          isValid: false,
          error: '"start" must be stricly less than "end"',
        }
      }

      const diffInMs = end.getTime() - start.getTime()
      const diffInDays = diffInMs / MS_PER_DAY
      if (diffInDays > MAX_SUPPORTED_TIME_RANGE_IN_DAYS) {
        return {
          isValid: false,
          error: 'Time range too long',
        }
      }
    } else if (granularity === MetricsGranularity.TOTAL) {
      return {
        isValid: false,
        error: 'Must provide time range for "TOTAL" requests',
      }
    }
    return { isValid: true }
  }
}
