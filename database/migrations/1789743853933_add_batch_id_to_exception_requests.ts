import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Identificador del lote con el que nacio la solicitud. */
const COLUMNA_LOTE = 'exception_request_batch_id'

/** Indice para recuperar el lote completo sin recorrer la tabla. */
const NOMBRE_INDICE = 'exception_requests_batch_id_index'

/**
 * Marca de origen del lote en las solicitudes de permiso.
 *
 * ## Por que
 * Cuando el colaborador pide un permiso de varios dias, el alta crea UNA fila
 * por dia: es lo que permite que la empresa autorice el 2 y el 3 y rechace el
 * 1. Esa granularidad es correcta y no se toca. Lo que faltaba era saber que
 * esas filas nacieron de la misma peticion, y sin ese dato dos cosas salian
 * mal: el aviso al aprobador se mandaba una vez por dia —cinco correos por un
 * permiso de cinco dias— y el comprobante que el colaborador adjunta solo
 * podia colgarse de una de las filas, con lo que desaparecia de los otros dias
 * justo cuando se resuelven por separado.
 *
 * ## Lo que esta columna NO es
 * No es una unidad de resolucion. Ninguna ruta de autorizacion la lee y no se
 * agrega ninguna que resuelva "el lote": aprobar y rechazar siguen siendo actos
 * individuales sobre una fila. La columna solo dice de donde vino la solicitud,
 * nunca que hacer con ella.
 *
 * ## Datos historicos
 * Nace nullable y sin backfill. Las solicitudes anteriores se quedan en NULL y
 * se tratan como lo que son: peticiones sueltas de un solo dia. Inventarles un
 * lote agrupando por empleado y fechas contiguas seria afirmar un hecho que
 * nadie registro.
 *
 * ## Seguridad en base con datos
 * El ALTER no toca ninguna fila existente ni exige valor por omision. Cada paso
 * se aplica solo si falta, para que la migracion sea idempotente en una base
 * donde ya corrio parcialmente.
 */
export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.defer(async (db) => {
      const columnas = await this.columnasExistentes(db)

      if (!columnas.has(COLUMNA_LOTE)) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` ADD COLUMN \`${COLUMNA_LOTE}\` CHAR(36) NULL
             AFTER \`exception_request_id\``
        )
      }

      if (!(await this.existeIndice(db))) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\`
             ADD INDEX \`${NOMBRE_INDICE}\` (\`${COLUMNA_LOTE}\`)`
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await this.existeIndice(db)) {
        await db.rawQuery(`ALTER TABLE \`${this.tableName}\` DROP INDEX \`${NOMBRE_INDICE}\``)
      }

      const columnas = await this.columnasExistentes(db)

      if (columnas.has(COLUMNA_LOTE)) {
        await db.rawQuery(`ALTER TABLE \`${this.tableName}\` DROP COLUMN \`${COLUMNA_LOTE}\``)
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
   * Se pregunta por el indice buscando la columna indexada, no por su nombre:
   * si alguien lo creo con otro nombre, un `ADD INDEX` crearia un segundo
   * indice equivalente sobre la misma columna.
   */
  private async existeIndice(db: QueryClientContract): Promise<boolean> {
    const rows = await db.rawQuery(
      `SELECT INDEX_NAME AS nombre FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, COLUMNA_LOTE]
    )
    const filas = Array.isArray(rows) ? (rows[0] as Array<{ nombre: string }>) : []

    return filas.length > 0
  }
}
