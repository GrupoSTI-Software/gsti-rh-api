import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import CommandSweepService from '#modules/device-commands/sweep/command_sweep.service'

/**
 * Cierra los comandos que quedaron colgados hacia los checadores
 * (spec ADMS 6.2). Pensado para correr cada minuto.
 */
export default class AdmsSweepCommands extends BaseCommand {
  static commandName = 'adms:sweep-commands'
  static description = 'Cierra los comandos en vuelo o acusados que agotaron su plazo'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const service = new CommandSweepService()
    try {
      const result = await service.run()
      // Pedir un padron es trabajo aunque no hubiera comandos colgados:
      // callarlo haria pensar que la corrida no hizo nada.
      if (result.taken === 0 && result.rosterRequested === 0 && result.revocationsClosed === 0) {
        this.logger.info('Barrido de comandos: nada colgado')
        return
      }
      this.logger.info(
        `Barrido de comandos: ${result.taken} revisado(s), ${result.timedOut} sin acuse, ${result.withoutEvidence} sin evidencia, ${result.rosterRequested} padron(es) pedido(s), ${result.revocationsClosed} baja(s) cerrada(s)`
      )
    } catch (error) {
      this.logger.error(
        `Barrido de comandos: fallo la corrida (${error instanceof Error ? error.message : String(error)})`
      )
      this.exitCode = 1
    }
  }
}
