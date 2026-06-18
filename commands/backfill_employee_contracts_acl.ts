import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import EmployeeContract from '#models/employee_contract'
import UploadService from '#services/upload_service'

const PAGE_SIZE = 100

/**
 * Comando de backfill para revocar el acceso público a los contratos históricos
 * almacenados en DigitalOcean Spaces.
 *
 * Recorre toda la tabla `employee_contracts` y aplica ACL `private` a cada objeto
 * en el Space sin re-subir el archivo (solo cambia el permiso).
 *
 * Uso:
 *   node ace backfill:employee-contracts-acl
 *   node ace backfill:employee-contracts-acl --dry-run
 */
export default class BackfillEmployeeContractsAcl extends BaseCommand {
  static commandName = 'backfill:employee-contracts-acl'
  static description =
    'Cambia el ACL de todos los contratos de empleado en DigitalOcean Spaces de public-read a private'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Lista objetos y acción prevista sin aplicar ningún cambio en el Space',
    alias: 'd',
  })
  declare dryRun: boolean

  async run() {
    const uploadService = new UploadService()

    const modePrefix = this.dryRun ? '[DRY-RUN] ' : ''
    this.logger.info(`${modePrefix}Iniciando backfill de ACL para contratos de empleado...`)

    const counters = {
      processed: 0,
      changed: 0,
      alreadyPrivate: 0,
      orphaned: 0,
      noPath: 0,
      errors: 0,
    }

    let page = 1
    let hasMore = true

    while (hasMore) {
      const rows = await EmployeeContract.query()
        .whereNotNull('employee_contract_file')
        .orderBy('employee_contract_id', 'asc')
        .paginate(page, PAGE_SIZE)

      if (rows.length === 0) {
        hasMore = false
        break
      }

      for (const contract of rows) {
        counters.processed++

        const storedPath = contract.employeeContractFile

        if (!storedPath) {
          counters.noPath++
          this.logger.warning(
            `[ID ${contract.employeeContractId}] Sin path almacenado — omitido`
          )
          continue
        }

        const ref = uploadService.resolveS3Ref(storedPath)

        if (!ref) {
          counters.errors++
          this.logger.warning(
            `[ID ${contract.employeeContractId}] No se pudo derivar la referencia S3 de: ${storedPath}`
          )
          continue
        }

        try {
          if (!uploadService.isStoredPathPublic(storedPath)) {
            counters.alreadyPrivate++
            this.logger.info(
              `[ID ${contract.employeeContractId}] Ya es privado (key directa) — omitido (bucket: ${ref.bucket}, key: ${ref.key})`
            )
            continue
          }

          if (this.dryRun) {
            counters.changed++
            this.logger.info(
              `[DRY-RUN] [ID ${contract.employeeContractId}] Se aplicaría ACL private (bucket: ${ref.bucket}, key: ${ref.key})`
            )
          } else {
            await uploadService.setObjectAcl(ref.bucket, ref.key, 'private')
            counters.changed++
            this.logger.info(
              `[ID ${contract.employeeContractId}] ACL cambiada a private (bucket: ${ref.bucket}, key: ${ref.key})`
            )
          }
        } catch (error: any) {
          if (
            error?.code === 'NotFound' ||
            error?.code === 'NoSuchKey' ||
            error?.statusCode === 404
          ) {
            counters.orphaned++
            this.logger.warning(
              `[ID ${contract.employeeContractId}] Objeto no encontrado en el Space (huérfano) — bucket: ${ref.bucket}, key: ${ref.key}`
            )
          } else {
            counters.errors++
            this.logger.error(
              `[ID ${contract.employeeContractId}] Error inesperado — ${error?.message ?? String(error)} (bucket: ${ref.bucket}, key: ${ref.key})`
            )
          }
        }
      }

      hasMore = rows.hasMorePages
      page++
    }

    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${modePrefix}Backfill completado. Resumen:`)
    this.logger.info(`  Procesados      : ${counters.processed}`)
    if (this.dryRun) {
      this.logger.info(`  Se cambiarían   : ${counters.changed}`)
    } else {
      this.logger.success(`  Cambiados       : ${counters.changed}`)
    }
    this.logger.info(`  Ya privados     : ${counters.alreadyPrivate}`)
    this.logger.warning(`  Huérfanos       : ${counters.orphaned}`)
    this.logger.warning(`  Sin path        : ${counters.noPath}`)
    if (counters.errors > 0) {
      this.logger.error(`  Errores         : ${counters.errors}`)
    } else {
      this.logger.info(`  Errores         : ${counters.errors}`)
    }
    this.logger.info('─────────────────────────────────────────')
  }
}
