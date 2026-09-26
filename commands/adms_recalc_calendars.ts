import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import CalendarRecalcService from '#modules/assist-ingestion/calendar-recalc/calendar_recalc.service'

/**
 * Consume la cola de recalculo de calendarios que deja el canal del checador
 * (spec ADMS 5.4). Pensado para correr cada minuto.
 */
export default class AdmsRecalcCalendars extends BaseCommand {
  static commandName = 'adms:recalc-calendars'
  static description =
    'Recalcula los calendarios pendientes que dejo la ingesta de checadas del checador'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const service = new CalendarRecalcService()
    try {
      const result = await service.run()
      if (result.recovered > 0) {
        this.logger.warning(
          `Recalculo de calendarios: ${result.recovered} trabajo(s) reclamado(s) sin cerrar volvieron a la cola`
        )
      }
      if (result.taken === 0) {
        this.logger.info('Recalculo de calendarios: sin trabajos pendientes')
        return
      }
      this.logger.info(
        `Recalculo de calendarios: ${result.taken} tomado(s), ${result.done} listo(s), ${result.failed} con error`
      )
    } catch (error) {
      this.logger.error(
        `Recalculo de calendarios: fallo la corrida (${error instanceof Error ? error.message : String(error)})`
      )
      this.exitCode = 1
    }
  }
}
