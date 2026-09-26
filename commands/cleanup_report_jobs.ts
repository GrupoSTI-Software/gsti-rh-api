import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ReportJobService from '#services/report_job_service'
import logger from '@adonisjs/core/services/logger'

export default class CleanupReportJobs extends BaseCommand {
  static commandName = 'report-jobs:cleanup'
  static description =
    'Elimina archivos S3 expirados, borra registros de jobs vencidos y recupera jobs atorados en estado "processing"'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const service = new ReportJobService()

    try {
      const recovered = await service.recoverStuckJobs()
      if (recovered > 0) {
        logger.info({ recovered }, 'report-jobs:cleanup — jobs atorados recuperados')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message }, 'report-jobs:cleanup — error al recuperar jobs atorados')
    }

    try {
      const deleted = await service.cleanupExpiredJobs()
      logger.info({ deleted }, 'report-jobs:cleanup — jobs/archivos expirados eliminados')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message }, 'report-jobs:cleanup — error al limpiar jobs expirados')
    }
  }
}
