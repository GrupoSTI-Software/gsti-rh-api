import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'
import WorkJournalSealRunOrchestrator from '#modules/work-journal/work_journal.seal_run_orchestrator'

/**
 * Job de cierre automático de jornada (USRH1782268640950): recorre todas
 * las empresas, detecta con el calculador (-02) los periodos de nómina que
 * vencieron en la fecha de corte y los sella con el servicio de la pieza
 * base (-01). Reintenta automáticamente lo que falló en corridas previas.
 *
 * Disparo normal: scheduler (ver `start/scheduler.ts`), una vez al día.
 * Disparo manual (depuración): `node ace work-journal:seal-period --date=2026-06-15 --business-unit-id=3`.
 *
 * Guardia de producción igual que `sync:assistance`: fuera de producción no
 * corre solo (evita sellar datos de dev/staging por accidente); sí corre
 * manualmente con `--force` para pruebas controladas.
 *
 * El comando NUNCA lanza para no romper la cadena del scheduler ante un
 * fallo puntual de una empresa (eso ya lo tolera el orquestador); ante un
 * error inesperado del propio comando, lo loguea y devuelve exit 1.
 */
export default class SealWorkJournalPeriod extends BaseCommand {
  static commandName = 'work-journal:seal-period'
  static description =
    'Cierra y sella el periodo de nómina vencido de cada empresa (registro electrónico de jornada)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description: 'Fecha de corte a evaluar (YYYY-MM-DD). Por default, "ayer" en zona de negocio.',
  })
  declare date?: string

  @flags.number({
    description: 'Acota la corrida a una sola empresa (business_unit_id), para depuración manual.',
  })
  declare businessUnitId?: number

  @flags.boolean({
    description: 'Corre aunque NODE_ENV no sea "production" (para pruebas manuales controladas).',
  })
  declare force: boolean

  async run() {
    if (env.get('NODE_ENV') !== 'production' && this.force !== true) {
      this.logger.info(
        'work-journal:seal-period — se omite: el entorno no es producción (usa --force para forzar)'
      )
      return
    }

    this.logger.info(
      `work-journal:seal-period — inicio (cutoff=${this.date ?? 'ayer (default)'}, businessUnitId=${this.businessUnitId ?? 'todas'})`
    )

    try {
      const orchestrator = new WorkJournalSealRunOrchestrator()
      const run = await orchestrator.run(this.date, { businessUnitId: this.businessUnitId })

      this.logger.info(
        `work-journal:seal-period — fin: run #${run.workJournalSealRunId} estado=${run.status} ` +
          `empresas=${run.summary?.businessUnitsProcessed ?? 0} sinConfig=${run.summary?.businessUnitsWithoutConfig ?? 0} ` +
          `sellados=${run.summary?.periodsSealed ?? 0} omitidos=${run.summary?.periodsSkipped ?? 0} ` +
          `errores=${run.summary?.periodsWithErrors ?? 0}`
      )

      if (run.status === 'failed') {
        this.exitCode = 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`work-journal:seal-period — error fatal: ${message}`)
      this.exitCode = 1
    }
  }
}
