import { inject } from '@adonisjs/core'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import SystemCatalogConsistencyService, {
  type SystemCatalogFinding,
} from '#services/system_catalog_consistency_service'

/**
 * Revisión de consistencia del catálogo: compara
 * `app/constants/system_modules_menu/system_modules.constant.ts` (grupos,
 * módulos y permisos, en todos los módulos) contra la BD, y separa lo que
 * corrige la siembra de lo que requiere una decisión.
 *
 * De **solo lectura**: nunca corrige, crea ni borra nada. Es una operación de
 * instalación y mantenimiento que se dispara a mano con
 * `node ace permissions:check-consistency`; no está enganchada a CI.
 *
 * Código de salida: 1 ante cualquier hallazgo, de cualquiera de los dos
 * bloques; 0 solo si la BD coincide con la constante.
 */
export default class PermissionsCheckConsistency extends BaseCommand {
  static readonly commandName = 'permissions:check-consistency'
  static readonly description =
    'Revisión de solo lectura: compara system_modules.constant.ts contra grupos, módulos y permisos en BD'

  static readonly options: CommandOptions = {
    startApp: true,
  }

  @inject()
  async run(service: SystemCatalogConsistencyService) {
    this.logger.info('permissions:check-consistency — inicio')

    const findings = await service.check()

    this.logSection(
      'Se corrige con el seeder',
      findings.filter((item) => item.fixableBySeed)
    )
    this.logSection(
      'Requiere decisión',
      findings.filter((item) => !item.fixableBySeed)
    )

    if (findings.length > 0) {
      this.logger.error(
        `permissions:check-consistency — fin: ${findings.length} hallazgo(s) entre la constante y la BD`
      )
      this.exitCode = 1
      return
    }

    this.logger.success('permissions:check-consistency — fin: sin hallazgos')
  }

  private logSection(title: string, findings: SystemCatalogFinding[]) {
    this.logger.info(`\n${title}:`)
    if (findings.length === 0) {
      this.logger.info('  (ninguno)')
      return
    }
    for (const item of findings) {
      this.logger.info(`  - [${item.code}] ${item.subject}: ${item.detail}`)
    }
  }
}
