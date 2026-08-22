import { inject } from '@adonisjs/core'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import SyncAssistsService from '#services/sync_assists_service'
import { TenantContext } from '#utils/tenant_context'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'

import { ASSIST_SYNC_RUN_UNSCOPED_REASON } from '#constants/assist_sync'

export default class SyncAssistance extends BaseCommand {
  static commandName = 'sync:assistance'
  static description = 'command to sync assistance data'

  static options: CommandOptions = {
    startApp: true,
  }

  @inject()
  async run() {
    const startLogTime = DateTime.now()
    try {
      if (env.get('NODE_ENV') !== 'production') {
        logger.info('Skipping synchronization as the environment is not production.')
        return
      }

      await TenantContext.runUnscoped(async () => {
        const syncAssistsService = new SyncAssistsService()

        let lasPage = await syncAssistsService.getLastPage()
        let assistStatusSync = await syncAssistsService.getAssistStatusSync()

        await syncAssistsService.synchronize(
          assistStatusSync?.dateRequestSync?.toJSDate()?.toISOString() ?? '2024-05-05',
          lasPage?.pageNumber
        )

        let lastPageAfterSync = await syncAssistsService.getLastPage()

        if (lastPageAfterSync?.pageNumber !== lasPage?.pageNumber) {
          await syncAssistsService.synchronize(
            assistStatusSync?.dateRequestSync?.toJSDate()?.toISOString() ?? '2024-05-05',
            lastPageAfterSync?.pageNumber
          )
        }
      }, ASSIST_SYNC_RUN_UNSCOPED_REASON)

      logger.info(
        `LOG SYNC ASSIST TIME (${startLogTime.setZone('UTC-6').toFormat('ff')}) => ${startLogTime.diffNow().milliseconds * -1} ms`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      await this.sentMailStatus('Error during assistance synchronization: ' + message)
      logger.info(
        `LOG SYNC ASSIST TIME => ${startLogTime.diffNow().milliseconds * -1} ms >> Error during assistance synchronization:`,
        error
      )
    }
  }

  async sentMailStatus(messageText: string = '') {
    try {
      await mail.send((message) => {
        message
          .to('wramirez@siler-mx.com')
          .from('wilvardo@gmail.com')
          .subject('Synchronization')
          .text(messageText)
      })
    } catch (emailError) {
      logger.info('Error sending synchronization email:', emailError)
    }
  }
}
