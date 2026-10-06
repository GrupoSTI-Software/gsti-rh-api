import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import i18nManager from '@adonisjs/i18n/services/main'
import StructurePlaceholderRetirementService, {
  FAILURES,
  STRUCTURE_PLACEHOLDER_IDS,
  StructurePlaceholderRetirementError,
  type ReferenceCount,
  type BlockingReference,
} from '#services/structure_placeholder_retirement_service'

/**
 * Retira los registros de relleno de la estructura (USRH1788466831452).
 *
 * Orden de operación (R1): inventario, ensayo, retiro por empresa y cierre.
 * Los modos que escriben exigen el identificador del respaldo completo (R2).
 */
export default class StructureRetirePlaceholders extends BaseCommand {
  static commandName = 'structure:retire-placeholders'
  static description =
    'Inventaría y retira los registros de relleno de departamentos y puestos, empresa por empresa'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.number({ description: 'Identificador de la empresa que se retira' })
  declare tenant: number

  @flags.boolean({ description: 'Cierre global: verifica y borra los dos registros' })
  declare finalize: boolean

  @flags.boolean({ description: 'Calcula el efecto y no escribe' })
  declare dryRun: boolean

  @flags.string({ description: 'Identificador del respaldo completo tomado antes' })
  declare backupRef: string

  @flags.boolean({
    description: 'También vacía contratos vivos ligados a catálogos dados de baja',
  })
  declare includeContracts: boolean

  async run() {
    const service = new StructurePlaceholderRetirementService(
      i18nManager.locale(i18nManager.defaultLocale)
    )
    try {
      this.assertFlags()
      const options = {
        dryRun: Boolean(this.dryRun),
        backupRef: this.backupRef ?? null,
        includeContracts: Boolean(this.includeContracts),
      }

      if (this.finalize) {
        const result = await service.finalize(STRUCTURE_PLACEHOLDER_IDS, options)
        if (result.alreadyRetired) {
          this.logger.info('ya retirado')
          return
        }
        this.printBlocking(result.blocking)
        if (result.blocking.length > 0) {
          const failure = {
            title: 'Quedan referencias a los registros de relleno',
            detail: 'El cierre se detuvo y no borró los registros.',
            key: 'quedan-referencias-a-los-registros-de-relleno',
          }
          this.logger.error(`${failure.title} | ${failure.detail} | ${failure.key}`)
          this.exitCode = 1
          return
        }
        this.logger.info(result.deleted ? 'cierre aplicado' : 'ensayo de cierre')
        if (result.snapshotPath) this.logger.info(`respaldo dirigido | ${result.snapshotPath}`)
        return
      }

      if (this.hasTenant()) {
        const result = await service.retireForTenant(STRUCTURE_PLACEHOLDER_IDS, this.tenant, options)
        this.printReferences(result.changed)
        if (result.snapshotPath) this.logger.info(`respaldo dirigido | ${result.snapshotPath}`)
        return
      }

      const inventory = await service.inventory(STRUCTURE_PLACEHOLDER_IDS)
      this.logger.info(
        `relleno | ${inventory.placeholdersExist ? 'presente' : 'ausente'} | contrato anulable | ${inventory.contractStructureNullable ? 'si' : 'no'}`
      )
      this.printReferences(inventory.references)
      this.printBlocking(inventory.blocking)
    } catch (error) {
      if (error instanceof StructurePlaceholderRetirementError) {
        this.logger.error(`${error.title} | ${error.detail} | ${error.key}`)
        this.exitCode = 1
        return
      }
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'desconocido'
      this.logger.error(`Error de base de datos | ${code}`)
      this.exitCode = 1
    }
  }

  /** Rechaza combinaciones que no tienen un modo definido (R1). */
  private assertFlags(): void {
    const tenant = this.hasTenant()
    const finalize = Boolean(this.finalize)
    const dryRun = Boolean(this.dryRun)
    const backup = Boolean(this.backupRef)
    const includeContracts = Boolean(this.includeContracts)
    const invalid =
      (tenant && finalize) ||
      (includeContracts && !tenant) ||
      ((dryRun || backup) && !tenant && !finalize)
    if (!invalid) return
    const failure = FAILURES['combinacion-de-opciones-no-valida']
    throw new StructurePlaceholderRetirementError(
      'combinacion-de-opciones-no-valida',
      failure.title,
      failure.detail
    )
  }

  private hasTenant(): boolean {
    return typeof this.tenant === 'number' && !Number.isNaN(this.tenant)
  }

  private printReferences(rows: ReferenceCount[]): void {
    for (const row of rows) {
      const company = row.businessUnitId === null ? '-' : String(row.businessUnitId)
      const alive = row.alive === null ? '-' : String(row.alive)
      this.logger.info(`${row.reference} | ${company} | ${row.total} | ${alive}`)
    }
  }

  private printBlocking(rows: BlockingReference[]): void {
    for (const row of rows) {
      const company = row.businessUnitId === null ? '-' : String(row.businessUnitId)
      this.logger.info(`${row.table}.${row.column} | ${company} | ${row.total}`)
    }
  }
}
