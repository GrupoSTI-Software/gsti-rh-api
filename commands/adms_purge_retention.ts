import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DateTime } from 'luxon'
import RetentionService from '#modules/adms/retention/retention.service'
import { admsRetentionSummary } from '#modules/adms/retention/retention.constants'

/**
 * Borra por plazo lo que ya cumplio su retencion (spec ADMS 13.12).
 *
 * Un solo comando para las cuatro tablas: el orden importa y separarlo en
 * cuatro invita a correr solo algunos. Se purga en tandas y se repite hasta
 * vaciar o hasta el tope de vueltas, para no tener una corrida que dure horas.
 *
 * Pensado para una vez al dia, de madrugada.
 */
export default class AdmsPurgeRetention extends BaseCommand {
  static commandName = 'adms:purge-retention'
  static description = 'Borra crudos, comandos, publicaciones y cuarentenas que cumplieron su plazo'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Solo informa los plazos vigentes, sin borrar nada' })
  declare dryRun: boolean

  @flags.number({ description: 'Tope de tandas por tabla (por defecto 20)' })
  declare maxBatches: number

  async run() {
    const summary = admsRetentionSummary()
    this.logger.info(
      `Retencion vigente: crudo ${summary.rawDays}d (fallido ${summary.rawFailedDays}d), ` +
        `comandos ${summary.commandDays}d, publicaciones ${summary.photoPublicationDays}d, ` +
        `cuarentena ${summary.quarantineDays}d`
    )
    if (this.dryRun) return

    const service = new RetentionService()
    const now = DateTime.utc()
    const maxBatches = this.maxBatches && this.maxBatches > 0 ? this.maxBatches : 20

    try {
      /**
       * Primero se cierran las publicaciones vencidas y despues se purgan: una
       * fila `published` con el plazo pasado ya no sirve, pero mientras lo diga
       * cualquier lectura casual la lee como viva.
       */
      const expired = await service.expirePhotoPublications(now)
      if (expired > 0) this.logger.info(`Publicaciones vencidas cerradas: ${expired}`)

      const totals = {
        publicaciones: await this.drain(() => service.purgePhotoPublications(now), maxBatches),
        crudos: await this.drain(() => service.purgeRawMessages(now), maxBatches),
        comandos: await this.drain(() => service.purgeCommands(now), maxBatches),
        cuarentenas: await this.drain(() => service.purgeQuarantine(now), maxBatches),
      }

      const nada = Object.values(totals).every((count) => count === 0)
      if (nada) {
        this.logger.info('Retencion: nada que borrar')
        return
      }
      this.logger.info(
        `Retencion: ${totals.crudos} crudo(s), ${totals.comandos} comando(s), ` +
          `${totals.publicaciones} publicacion(es), ${totals.cuarentenas} cuarentena(s)`
      )
    } catch (error) {
      this.logger.error(
        `Retencion: fallo la corrida (${error instanceof Error ? error.message : String(error)})`
      )
      this.exitCode = 1
    }
  }

  /** Repite hasta vaciar o hasta el tope: una corrida no puede durar horas. */
  private async drain(
    run: () => Promise<{ deleted: number; hasMore: boolean }>,
    maxBatches: number
  ): Promise<number> {
    let total = 0
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await run()
      total += result.deleted
      if (!result.hasMore) break
      if (batch === maxBatches - 1) {
        this.logger.warning(
          `Retencion: quedaron filas por borrar tras ${maxBatches} tandas; la proxima corrida sigue`
        )
      }
    }
    return total
  }
}
