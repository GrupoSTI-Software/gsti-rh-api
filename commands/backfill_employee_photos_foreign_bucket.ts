import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import Employee from '#models/employee'
import UploadService from '#services/upload_service'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

const PAGE_SIZE = 100
const DOWNLOAD_TIMEOUT_MS = 15_000
/** Solo se descargan URLs de DigitalOcean Spaces: el comando no es un cliente HTTP genérico. */
const SPACES_HOST_SUFFIX = '.digitaloceanspaces.com'

/**
 * Migra al bucket configurado las fotos de perfil que la base guarda como URL de otro bucket.
 *
 * Por qué existe: `GET /api/employees/:id/photo` solo entrega objetos del bucket configurado
 * (`streamStoredFile` descarta una referencia ajena: es el candado que cerró el SSRF de `proxy-image`).
 * Las filas históricas que apuntan a otro bucket —las de SAE viven en `sae-assets`— responden 404 y el
 * backoffice pinta la inicial en lugar de la foto. El arreglo es de datos, no de relajar el candado.
 *
 * Qué hace por empleado con foto en `--source-bucket`:
 * 1. Descarga la URL pública (HTTP GET, sin credenciales; solo hosts de Spaces y solo ese bucket).
 * 2. La pasa por el perfil `profile-photo` como cualquier foto subida: firma real, tope de tamaño,
 *    re-encode y ACL privada, en la carpeta `employees`.
 * 3. Reescribe `employee_photo` con la key nueva.
 *
 * El objeto original NO se borra: queda en el bucket de origen y su URL se registra en el log, por si hay
 * que revertir una fila. Sin `--apply` solo informa qué haría.
 *
 * Uso:
 *   node ace backfill:employee-photos-foreign-bucket --source-bucket=sae-assets
 *   node ace backfill:employee-photos-foreign-bucket --source-bucket=sae-assets --business-unit-id=3 --apply
 */
export default class BackfillEmployeePhotosForeignBucket extends BaseCommand {
  static commandName = 'backfill:employee-photos-foreign-bucket'
  static description =
    'Copia al bucket configurado las fotos de empleado guardadas como URL de otro bucket y reescribe su referencia'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description: 'Bucket de origen a migrar (p. ej. sae-assets). Obligatorio: no se migra "cualquier bucket ajeno"',
    required: true,
  })
  declare sourceBucket: string

  @flags.number({ description: 'Limita la migración a una unidad de negocio' })
  declare businessUnitId: number | undefined

  @flags.boolean({ description: 'Aplica los cambios. Sin esta bandera solo lista lo que haría' })
  declare apply: boolean

  async run() {
    await TenantContext.runUnscoped(
      async () => {
        await this.execute()
      },
      TENANT_UNSCOPED_REASON.BACKFILL_MAINTENANCE,
      BackfillEmployeePhotosForeignBucket.commandName
    )
  }

  private async execute() {
    const uploadService = new UploadService()
    const modePrefix = this.apply ? '' : '[DRY-RUN] '
    this.logger.info(`${modePrefix}Migrando fotos de empleado del bucket "${this.sourceBucket}"...`)

    const counters = {
      processed: 0,
      migrated: 0,
      otherReference: 0,
      invalidUrl: 0,
      unreachable: 0,
      rejected: 0,
      errors: 0,
    }

    const workDir = await mkdtemp(join(tmpdir(), 'employee-photos-'))
    let page = 1
    let hasMore = true

    try {
      while (hasMore) {
        const query = Employee.query()
          .whereNotNull('employee_photo')
          .whereNull('employee_deleted_at')
          .orderBy('employee_id', 'asc')
        if (this.businessUnitId) query.where('business_unit_id', this.businessUnitId)
        const rows = await query.paginate(page, PAGE_SIZE)

        for (const employee of rows) {
          counters.processed++
          const employeeId = employee.employeeId
          const storedPath = employee.employeePhoto

          const ref = storedPath ? uploadService.resolveS3Ref(storedPath) : null
          if (!storedPath || !ref || ref.bucket !== this.sourceBucket) {
            counters.otherReference++
            continue
          }

          const url = this.parseSpacesUrl(storedPath)
          if (!url) {
            counters.invalidUrl++
            this.logger.warning(`[ID ${employeeId}] Referencia del bucket de origen sin URL de Spaces válida — omitida`)
            continue
          }

          if (!this.apply) {
            counters.migrated++
            this.logger.info(`[DRY-RUN] [ID ${employeeId}] Se migraría ${storedPath}`)
            continue
          }

          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
            if (!response.ok) {
              counters.unreachable++
              this.logger.warning(`[ID ${employeeId}] El origen respondió ${response.status} — omitida: ${storedPath}`)
              continue
            }

            const fileName = decodeURIComponent(url.pathname.split('/').pop() ?? 'foto')
            const tmpPath = join(workDir, `${employeeId}${extname(fileName)}`)
            const body = Buffer.from(await response.arrayBuffer())
            await writeFile(tmpPath, body)

            const newKey = await uploadService.fileUpload(
              { tmpPath, clientName: fileName, extname: extname(fileName).slice(1), size: body.length },
              'profile-photo',
              'employees'
            )

            // Update directo de la columna: no se dispara ningún hook del modelo sobre el resto de la fila.
            await Employee.query().where('employee_id', employeeId).update({ employee_photo: newKey })
            counters.migrated++
            this.logger.info(`[ID ${employeeId}] ${storedPath} -> ${newKey}`)
          } catch (error: unknown) {
            if (error instanceof FileIntakeError) {
              counters.rejected++
              this.logger.warning(`[ID ${employeeId}] La foto no pasa el perfil profile-photo — omitida: ${storedPath}`)
              continue
            }
            counters.errors++
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`[ID ${employeeId}] Error inesperado — ${message}: ${storedPath}`)
          }
        }

        hasMore = rows.hasMorePages
        page++
      }
    } finally {
      // Solo la carpeta temporal que creó este comando; el objeto de origen nunca se toca.
      await rm(workDir, { recursive: true, force: true })
    }

    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${modePrefix}Migración terminada. Resumen:`)
    this.logger.info(`  Procesados                 : ${counters.processed}`)
    this.logger.info(`  ${this.apply ? 'Migrados    ' : 'Se migrarían'}               : ${counters.migrated}`)
    this.logger.info(`  En otro bucket o ya locales: ${counters.otherReference}`)
    this.logger.warning(`  URL inválida               : ${counters.invalidUrl}`)
    this.logger.warning(`  Origen inaccesible         : ${counters.unreachable}`)
    this.logger.warning(`  Rechazadas por el perfil   : ${counters.rejected}`)
    this.logger.info(`  Errores                    : ${counters.errors}`)
    this.logger.info('─────────────────────────────────────────')
  }

  /**
   * Acepta solo URLs https de DigitalOcean Spaces. La referencia sale de la base, pero el comando no debe
   * convertirse en un cliente HTTP de cualquier dirección que alguien haya guardado ahí.
   */
  private parseSpacesUrl(storedPath: string): URL | null {
    try {
      const url = new URL(storedPath)
      return url.protocol === 'https:' && url.hostname.endsWith(SPACES_HOST_SUFFIX) ? url : null
    } catch {
      return null
    }
  }
}
