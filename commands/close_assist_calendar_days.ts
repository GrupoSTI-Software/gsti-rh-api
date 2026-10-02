import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import CalendarDayCloseService, {
  CALENDAR_DAY_CLOSE_LOOKBACK_DAYS,
} from '#modules/assist-ingestion/calendar-recalc/calendar_day_close.service'

/**
 * Cierre nocturno del calendario de asistencia guardado: manda a la cola de
 * recálculo los días que se guardaron antes de terminar. Lo consume
 * `adms:recalc-calendars`.
 *
 * Para un rezago mayor (días pasados que llevan semanas como futuros):
 * `node ace assist:close-calendar-days --days=90`.
 */
export default class CloseAssistCalendarDays extends BaseCommand {
  static commandName = 'assist:close-calendar-days'
  static description =
    'Manda a recalcular los días del calendario de asistencia que se guardaron antes de terminar'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.number({
    description: `Días hacia atrás a revisar (por default ${CALENDAR_DAY_CLOSE_LOOKBACK_DAYS}).`,
  })
  declare days?: number

  async run() {
    try {
      const result = await new CalendarDayCloseService().enqueue(undefined, this.days)
      this.logger.info(`Cierre de días: ${result.employees} colaborador(es) en la cola de recálculo`)
    } catch (error) {
      this.logger.error(
        `Cierre de días: falló la corrida (${error instanceof Error ? error.message : String(error)})`
      )
      this.exitCode = 1
    }
  }
}
