import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import SystemPermissionCatalogConsistencyService from '#services/system_permission_catalog_consistency_service'
import type { KnownDuplicateIdClaim } from '#constants/system_permission_catalog'

/**
 * Revisión de consistencia del índice maestro de módulos y permisos
 * (USRH1785766406720, regla 7): compara lo declarado en el catálogo tipado
 * contra lo registrado en `system_modules` / `system_permissions` y avisa de
 * qué lado está cada diferencia.
 *
 * De **solo lectura**: nunca corrige, crea ni borra nada. Es una operación
 * de instalación/mantenimiento (no queda al alcance de un usuario del
 * backoffice) — se dispara a mano con `node ace permissions:check-consistency`.
 * Esta entrega la deja disponible como comando manual; engancharla al
 * pipeline de publicación es una decisión pendiente de review, no de esta HU.
 *
 * Código de salida: 1 si hay diferencias declarado-vs-registrado (para poder
 * usarlo algún día en CI); 0 si no hay diferencias, sin importar cuánta
 * "deuda conocida" (módulos sin enumerar, colisiones de id históricas) se
 * liste — esa deuda es informativa, no un fallo de esta revisión.
 */
export default class PermissionsCheckConsistency extends BaseCommand {
  static readonly commandName = 'permissions:check-consistency'
  static readonly description =
    'Revisión de solo lectura: compara el índice maestro de módulos/permisos contra la BD'

  static readonly options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('permissions:check-consistency — inicio')

    const service = new SystemPermissionCatalogConsistencyService()
    const report = await service.checkConsistency()

    this.logSection(
      'Declarado en el catálogo, sin fila viva en BD',
      report.declaredNotRegistered.map((f) => `[${f.kind}] ${f.slug} — ${f.detail}`)
    )

    this.logSection(
      'Registrado en BD, ya no declarado en el catálogo (módulo Empleados)',
      report.registeredNotDeclared.map(
        (f) => `${f.slug} (systemPermissionId=${f.systemPermissionId})`
      )
    )

    this.logSection(
      'Deuda conocida — módulos reconocidos sin acciones enumeradas todavía',
      report.knownDebtModules
    )

    this.logSection('Módulos inactivos (informativo, regla 10)', report.inactiveModuleNotes)

    this.logSection(
      'Colisiones de id ya existentes en los seeders (informativo)',
      report.knownDuplicateIds.map(
        (f) =>
          `${f.kind} #${f.id}: ${f.claimedBy.map((claim) => this.formatClaim(claim)).join(' | ')}`
      )
    )

    const hasDifferences =
      report.declaredNotRegistered.length > 0 || report.registeredNotDeclared.length > 0

    if (hasDifferences) {
      this.logger.error(
        'permissions:check-consistency — fin: se encontraron diferencias declarado-vs-registrado'
      )
      this.exitCode = 1
      return
    }

    this.logger.success('permissions:check-consistency — fin: sin diferencias')
  }

  private formatClaim(claim: KnownDuplicateIdClaim): string {
    const moduleReference = claim.moduleId
      ? ` / módulo ${claim.moduleId}${claim.moduleSlug ? ` ${claim.moduleSlug}` : ''}`
      : ''
    return `${claim.slug}${moduleReference} (${claim.seederFile})`
  }

  private logSection(title: string, lines: string[]) {
    this.logger.info(`\n${title}:`)
    if (lines.length === 0) {
      this.logger.info('  (ninguno)')
      return
    }
    for (const line of lines) {
      this.logger.info(`  - ${line}`)
    }
  }
}
