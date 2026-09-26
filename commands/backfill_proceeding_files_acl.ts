import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ProceedingFile from '#models/proceeding_file'
import UploadService from '#services/upload_service'

const PAGE_SIZE = 100

/**
 * Comando de backfill para revocar el acceso público a los expedientes históricos
 * almacenados en DigitalOcean Spaces.
 *
 * Recorre toda la tabla `proceeding_file` y aplica ACL `private` a cada objeto
 * en el Space sin re-subir el archivo (solo cambia el permiso).
 *
 * Uso:
 *   node ace backfill:proceeding-files-acl
 *   node ace backfill:proceeding-files-acl --dry-run
 */
export default class BackfillProceedingFilesAcl extends BaseCommand {
  static commandName = 'backfill:proceeding-files-acl'
  static description =
    'Cambia el ACL de todos los expedientes en DigitalOcean Spaces de public-read a private'

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
    this.logger.info(`${modePrefix}Iniciando backfill de ACL para expedientes...`)

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
      const rows = await ProceedingFile.query()
        .whereNotNull('proceeding_file_path')
        .orderBy('proceeding_file_id', 'asc')
        .paginate(page, PAGE_SIZE)

      if (rows.length === 0) {
        hasMore = false
        break
      }

      for (const file of rows) {
        counters.processed++

        const storedPath = file.proceedingFilePath

        if (!storedPath) {
          counters.noPath++
          this.logger.warning(
            `[ID ${file.proceedingFileId}] Sin path almacenado — omitido`
          )
          continue
        }

        const ref = uploadService.resolveS3Ref(storedPath)

        if (!ref) {
          counters.errors++
          this.logger.warning(
            `[ID ${file.proceedingFileId}] No se pudo derivar la referencia S3 de: ${storedPath}`
          )
          continue
        }

        try {
          // La detección de "ya privado" se basa en el path almacenado en BD:
          // URL pública → fue subido con public-read (legacy, necesita backfill).
          // Key directa → fue subido con private (ya seguro, omitir).
          if (!uploadService.isStoredPathPublic(storedPath)) {
            counters.alreadyPrivate++
            this.logger.info(
              `[ID ${file.proceedingFileId}] Ya es privado (key directa) — omitido (bucket: ${ref.bucket}, key: ${ref.key})`
            )
            continue
          }

          if (this.dryRun) {
            counters.changed++
            this.logger.info(
              `[DRY-RUN] [ID ${file.proceedingFileId}] Se aplicaría ACL private (bucket: ${ref.bucket}, key: ${ref.key})`
            )
          } else {
            await uploadService.setObjectAcl(ref.bucket, ref.key, 'private')
            counters.changed++
            this.logger.info(
              `[ID ${file.proceedingFileId}] ACL cambiada a private (bucket: ${ref.bucket}, key: ${ref.key})`
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
              `[ID ${file.proceedingFileId}] Objeto no encontrado en el Space (huérfano) — bucket: ${ref.bucket}, key: ${ref.key}`
            )
          } else {
            counters.errors++
            this.logger.error(
              `[ID ${file.proceedingFileId}] Error inesperado — ${error?.message ?? String(error)} (bucket: ${ref.bucket}, key: ${ref.key})`
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
