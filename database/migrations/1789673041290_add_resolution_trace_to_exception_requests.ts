import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Nota con la que se resolvio la solicitud; es lo que el empleado ve con la respuesta. */
const COLUMNA_NOTA = 'exception_request_resolution_note'

/** Usuario que resolvio. */
const COLUMNA_RESOLUTOR = 'resolved_by_user_id'

/** Momento de la resolucion. */
const COLUMNA_FECHA = 'exception_request_resolved_at'

/** Llave foranea del resolutor contra `users`. */
const NOMBRE_LLAVE_FORANEA = 'exception_requests_resolved_by_user_id_foreign'

/**
 * HU-1 del rediseno de Solicitudes de permisos: la resolucion deja rastro.
 *
 * ## Por que
 * `ExceptionRequestsController.updateStatus` recibia el motivo del rechazo, lo
 * pasaba a la vista del correo del empleado y lo descartaba. La solicitud
 * quedaba resuelta sin registro de por que ni de quien: el backoffice no podia
 * mostrarlo, ninguna auditoria podia reconstruirlo y el expediente del empleado
 * se quedaba sin la version de la empresa.
 *
 * ## Las tres columnas son una sola cosa
 * Nota, resolutor y fecha se agregan juntas porque describen el mismo hecho. Una
 * nota sin autor no sirve de evidencia y un autor sin fecha no ordena el
 * historial del rediseno.
 *
 * ## Datos historicos
 * No hay backfill. Las solicitudes resueltas antes de esta migracion se quedan
 * con las tres columnas en NULL y la UI las presenta como resueltas sin nota
 * registrada. Poner al usuario que hoy corre la migracion como resolutor de una
 * decision que no tomo seria falsear el expediente.
 *
 * ## Seguridad en base con datos
 * Las tres nacen nullable, asi que el ALTER no toca ninguna fila existente ni
 * exige valor por omision. Cada paso se aplica solo si falta, para que la
 * migracion sea idempotente en una base donde ya corrio parcialmente.
 */
export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.defer(async (db) => {
      const columnas = await this.columnasExistentes(db)

      if (!columnas.has(COLUMNA_NOTA)) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` ADD COLUMN \`${COLUMNA_NOTA}\` TEXT NULL
             AFTER \`exception_request_description\``
        )
      }

      if (!columnas.has(COLUMNA_RESOLUTOR)) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` ADD COLUMN \`${COLUMNA_RESOLUTOR}\` INT UNSIGNED NULL
             AFTER \`${COLUMNA_NOTA}\``
        )
      }

      if (!columnas.has(COLUMNA_FECHA)) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` ADD COLUMN \`${COLUMNA_FECHA}\` TIMESTAMP NULL
             AFTER \`${COLUMNA_RESOLUTOR}\``
        )
      }

      if (!(await this.existeLlaveForanea(db))) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\`
             ADD CONSTRAINT \`${NOMBRE_LLAVE_FORANEA}\`
             FOREIGN KEY (\`${COLUMNA_RESOLUTOR}\`) REFERENCES \`users\` (\`user_id\`)
             ON DELETE SET NULL ON UPDATE RESTRICT`
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await this.existeLlaveForanea(db)) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` DROP FOREIGN KEY \`${NOMBRE_LLAVE_FORANEA}\``
        )
      }

      const columnas = await this.columnasExistentes(db)

      for (const columna of [COLUMNA_FECHA, COLUMNA_RESOLUTOR, COLUMNA_NOTA]) {
        if (columnas.has(columna)) {
          await db.rawQuery(`ALTER TABLE \`${this.tableName}\` DROP COLUMN \`${columna}\``)
        }
      }
    })
  }

  /** Columnas de la tabla en el esquema activo, para aplicar cada paso solo si falta. */
  private async columnasExistentes(db: QueryClientContract): Promise<Set<string>> {
    const rows = await db.rawQuery(
      `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [this.tableName]
    )
    const filas = Array.isArray(rows) ? (rows[0] as Array<{ nombre: string }>) : []

    if (filas.length === 0) {
      throw new Error(
        `${this.tableName}: la tabla no existe en el esquema activo. La crea ` +
          '1730138287439_create_create_exception_requests_table; corre esa migracion antes.'
      )
    }

    return new Set(filas.map((fila) => fila.nombre))
  }

  /**
   * Se pregunta por la llave del resolutor buscando la columna y la tabla
   * referenciadas, no por su nombre: si alguien la creo con otro nombre, un
   * `ADD CONSTRAINT` crearia una segunda llave equivalente.
   */
  private async existeLlaveForanea(db: QueryClientContract): Promise<boolean> {
    const rows = await db.rawQuery(
      `SELECT CONSTRAINT_NAME AS nombre FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
         AND REFERENCED_TABLE_NAME = 'users'`,
      [this.tableName, COLUMNA_RESOLUTOR]
    )
    const filas = Array.isArray(rows) ? (rows[0] as Array<{ nombre: string }>) : []

    return filas.length > 0
  }
}
