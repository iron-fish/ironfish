/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger, RpcClient, WebApi } from '@ironfish/sdk'
import chalk from 'chalk'

export async function doEligibilityCheck(client: RpcClient, logger: Logger): Promise<void> {
  const graffiti = (await client.getConfig({ name: 'blockGraffiti' })).content.blockGraffiti

  if (!graffiti) {
    logger.warn(chalk.yellow(`WARNING: Graffiti not set. Testnet points will not be recorded.`))
    return
  }

  const api = new WebApi()

  let user
  try {
    user = await api.findUser({ graffiti: graffiti })
  } catch (e) {
    logger.debug(`Failed to fetch API user: ${ErrorUtils.renderError(e)}`)
    return
  }

  if (!user) {
    logger.warn(chalk.yellow(`WARNING: Could not find a user with graffiti ${graffiti}`))
    return
  }

  if (!user.verified) {
    logger.warn(
      chalk.yellow(
        `WARNING: No verified email on account for graffiti ${graffiti}. You need this email to claim testnet rewards. Visit https://testnet.ironfish.network/login to verify.`,
      ),
    )
  }

  if (user.node_uptime_count < user.node_uptime_threshold) {
    const threshold_days = user.node_uptime_threshold / 2

    logger.warn(
      chalk.yellow(
        `WARNING: ${threshold_days} days (${
          threshold_days * 24
        } hours) of hosting a node is needed to qualify for Phase 3 points. You currently have ${
          user.node_uptime_count * 12
        } hours.`,
      ),
    )
  }
}
