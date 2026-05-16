import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { purgeDemoOperationalData } from '../app/modules/demo/services/demo_operational_purge.js'

export default class DemoPurge extends BaseCommand {
  static commandName = 'demo:purge'
  static description = 'Vacía todas las tablas operacionales para modo demo'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Iniciando purge de tablas demo...')

    try {
      await purgeDemoOperationalData({
        info:  (msg) => this.logger.info(msg),
        warn:  (msg) => this.logger.warning(msg),
      })
      this.logger.success('Purge completado exitosamente')
    } catch (error) {
      this.logger.error(`Error durante el purge: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof Error && error.stack) {
        this.logger.error(error.stack)
      }
    }
  }
}
