import { inject } from '@adonisjs/core'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import SyncAssistsService from '#services/sync_assists_service'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'

export default class SyncAssistance extends BaseCommand {
  static commandName = 'sync:assistance'
  static description = 'command to sync assistance data'

  static options: CommandOptions = {
    startApp: true,
  }

  @inject()
  async run() {
    const syncAssistsService = new SyncAssistsService()
    const startLogTime = DateTime.now()
    try {
      if (env.get('NODE_ENV') !== 'production') {
        logger.info('Skipping synchronization as the environment is not production.')
        return
      }

      let lasPage = await syncAssistsService.getLastPage()
      let assistStatusSync = await syncAssistsService.getAssistStatusSync()

      await syncAssistsService.synchronize(assistStatusSync?.dateRequestSync?.toJSDate()?.toISOString() ?? '2024-05-05', lasPage?.pageNumber)

      let lastPageAfterSync = await syncAssistsService.getLastPage()

      if (lastPageAfterSync?.pageNumber !== lasPage?.pageNumber) {
        await syncAssistsService.synchronize(assistStatusSync?.dateRequestSync?.toJSDate()?.toISOString() ?? '2024-05-05', lastPageAfterSync?.pageNumber)
      }

      logger.info(`LOG SYNC ASSIST TIME (${startLogTime.setZone('UTC-6').toFormat('ff')}) => ${startLogTime.diffNow().milliseconds * -1} ms`)
    } catch (error) {
      this.sentMailStatus('Error during assistance synchronization: ' + error.message)
      logger.info(`LOG SYNC ASSIST TIME => ${startLogTime.diffNow().milliseconds * -1} ms >> Error during assistance synchronization:`, error)
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
