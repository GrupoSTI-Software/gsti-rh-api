import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import { DOCUMENT_TEMPLATE_STATUS } from '#modules/employee-offboarding/document-templates/document_templates.constants'
import type { DocumentTemplateValidationResult } from '#modules/employee-offboarding/document-templates/document_template_validation_result.type'
import type { EmployeeOffboardingDocumentType } from '#modules/employee-offboarding/documents/documents.constants'

const PAGE_SIZE = 100

/**
 * Candado V-1 (USRH1789097550387, regla 11): toda plantilla `current` sin
 * dictamen (`validation_result` NULL, subida entre USRH1788553841100 y esta
 * HU) pasa a `rejected` con el motivo `unvalidated_legacy`. La empresa vuelve
 * a la plantilla del sistema y nunca más existe una vigente sin revisión.
 *
 * Corre FUERA de request y recorre la tabla completa a propósito: es el único
 * punto del set que cruza empresas, y lo hace sin `TenantContext` (el mixin
 * del modelo no filtra sin contexto). Idempotente: la segunda corrida no
 * encuentra filas. Paso de despliegue, con credenciales de operación.
 *
 * Uso:
 *   node ace backfill:reject-unvalidated-document-templates
 *   node ace backfill:reject-unvalidated-document-templates --dry-run
 */
export default class BackfillRejectUnvalidatedDocumentTemplates extends BaseCommand {
  static commandName = 'backfill:reject-unvalidated-document-templates'
  static description =
    'Candado V-1: degrada a rejected toda plantilla vigente sin dictamen de revisión'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Lista las versiones afectadas sin escribir ningún cambio',
    alias: 'd',
  })
  declare dryRun: boolean

  async run() {
    const modePrefix = this.dryRun ? '[DRY-RUN] ' : ''
    this.logger.info(`${modePrefix}Buscando plantillas vigentes sin dictamen...`)

    const counters = { found: 0, rejected: 0, errors: 0 }

    // Los ids se fijan ANTES de escribir: al degradar dejan de casar el filtro
    // y un paginado por offset se saltaría filas.
    const pending = await EmployeeOffboardingDocumentTemplate.query()
      .select('employee_offboarding_document_template_id')
      .where('employee_offboarding_document_template_status', DOCUMENT_TEMPLATE_STATUS.CURRENT)
      .whereNull('employee_offboarding_document_template_validation_result')
      .orderBy('employee_offboarding_document_template_id', 'asc')
    const ids = pending.map((row) => row.employeeOffboardingDocumentTemplateId)
    counters.found = ids.length

    for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
      const page = ids.slice(offset, offset + PAGE_SIZE)
      const rows = await EmployeeOffboardingDocumentTemplate.query()
        .whereIn('employee_offboarding_document_template_id', page)
        .where('employee_offboarding_document_template_status', DOCUMENT_TEMPLATE_STATUS.CURRENT)
        .whereNull('employee_offboarding_document_template_validation_result')

      for (const template of rows) {
        const label = `[ID ${template.employeeOffboardingDocumentTemplateId}] empresa ${template.businessUnitId} · ${template.employeeOffboardingDocumentTemplateDocumentType} v${template.employeeOffboardingDocumentTemplateVersionNumber}`
        if (this.dryRun) {
          counters.rejected++
          this.logger.info(`[DRY-RUN] ${label} pasaría a rejected (unvalidated_legacy)`)
          continue
        }
        try {
          template.employeeOffboardingDocumentTemplateStatus = DOCUMENT_TEMPLATE_STATUS.REJECTED
          template.employeeOffboardingDocumentTemplateValidationResult = this.legacyVerdict(
            template.employeeOffboardingDocumentTemplateDocumentType as EmployeeOffboardingDocumentType
          )
          await template.save()
          counters.rejected++
          this.logger.info(`${label} → rejected (unvalidated_legacy)`)
        } catch (error) {
          counters.errors++
          this.logger.error(
            `${label} error inesperado — ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }

    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${modePrefix}Candado V-1 completado. Resumen:`)
    this.logger.info(`  Sin dictamen    : ${counters.found}`)
    if (this.dryRun) {
      // Etiqueta sin acentos: el logger de Ace corrompe los multibyte fuera de una TTY
      this.logger.info(`  Por degradar    : ${counters.rejected}`)
    } else {
      this.logger.success(`  Degradadas      : ${counters.rejected}`)
    }
    if (counters.errors > 0) {
      this.logger.error(`  Errores         : ${counters.errors}`)
    }
  }

  /** Dictamen del candado: estructura no revisada, listas vacías, `passed: false`. */
  private legacyVerdict(
    documentType: EmployeeOffboardingDocumentType
  ): DocumentTemplateValidationResult {
    return {
      checkedAt: new Date().toISOString(),
      documentType,
      passed: false,
      recognized: [],
      unrecognized: [],
      missingRequired: [],
      structural: { stage: 'structural', reason: 'unvalidated_legacy', detail: null },
    }
  }
}
