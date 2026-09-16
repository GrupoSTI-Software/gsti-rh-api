import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Columna que se endurece. */
const COLUMNA = 'business_unit_id'

/** Nombre con el que la M3 original creó la llave foránea; se conserva para no duplicarla. */
const NOMBRE_LLAVE_FORANEA = 'assists_business_unit_id_foreign'

/**
 * USRH1786566437097 — M3 (reposición): endurece `assists.business_unit_id`
 * a NOT NULL + llave foránea contra `business_units`.
 *
 * ## Por qué vuelve a existir
 * La M3 original (`1786566437097002_enforce_not_null_business_unit_id_on_assists`)
 * se borró en `fab69b76`, un commit de códigos de descuento sin relación con
 * assists. Desde entonces ninguna base nueva endurece la columna: nace nullable y
 * sin FK, así que el aislamiento por empresa dependía solo del hook del modelo.
 *
 * ## Por qué con nombre nuevo y no restaurando el viejo
 * Lucid registra cada migración por el NOMBRE del archivo. Con un nombre nuevo la
 * ejecutan TODAS las bases, incluidas aquellas donde la M3 vieja alcanzó a correr
 * y la tabla ya está endurecida. Por eso cada paso se aplica solo si falta: esa
 * idempotencia es lo que la vuelve segura en una base con datos, no un supuesto
 * sobre qué entornos llegaron a correr la migración perdida.
 *
 * ## Seguridad en base con datos
 * - No inventa pertenencia: aquí no hay UPDATE. Si quedan checadas en cuarentena
 *   (`business_unit_id IS NULL`) la migración ABORTA sin tocar el esquema.
 * - Si hay checadas apuntando a una empresa inexistente, aborta antes de la FK:
 *   crearla fallaría con errno 1452, sin decir cuántas filas la rompen.
 * - El índice `assists_business_unit_id_index` lo crea M1; aquí no se toca.
 *
 * Runbook y evidencia: `database/migration_evidence/USRH1786566437097/README.md`.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.defer(async (db) => {
      const columna = await this.estadoDeLaColumna(db)

      if (!columna.existe) {
        throw new Error(
          'assists: no existe la columna business_unit_id. La crea la M1 ' +
            '(1786566437097000_add_business_unit_id_to_assists); corre esa migración antes ' +
            'de endurecer la columna.'
        )
      }

      const llavesForaneas = await this.llavesForaneasDeLaColumna(db)
      const faltaLlaveForanea = llavesForaneas.length === 0

      // Base ya endurecida (p. ej. donde alcanzó a correr la M3 vieja): nada que hacer.
      if (!columna.esNullable && !faltaLlaveForanea) return

      if (columna.esNullable) {
        const enCuarentena = await this.contar(
          db,
          `SELECT COUNT(*) AS total FROM \`${this.tableName}\` WHERE \`${COLUMNA}\` IS NULL`
        )

        if (enCuarentena > 0) {
          throw new Error(
            `assists: ${enCuarentena} checada(s) con business_unit_id NULL (cuarentena). ` +
              'No se endurece la columna ni se les inventa empresa. Resuélvelas antes: ' +
              'foto previa con `node ace assist:migration-evidence --step=post-deploy` y ' +
              'constancia de cada resolución manual con ' +
              '`node ace assist:migration-evidence record`. ' +
              'Runbook: database/migration_evidence/USRH1786566437097/README.md'
          )
        }
      }

      if (faltaLlaveForanea) {
        const sinEmpresaReal = await this.contar(
          db,
          `SELECT COUNT(*) AS total
             FROM \`${this.tableName}\` a
             LEFT JOIN \`business_units\` b ON b.business_unit_id = a.\`${COLUMNA}\`
            WHERE a.\`${COLUMNA}\` IS NOT NULL
              AND b.business_unit_id IS NULL`
        )

        if (sinEmpresaReal > 0) {
          throw new Error(
            `assists: ${sinEmpresaReal} checada(s) apuntan a una empresa que ya no existe. ` +
              'No se crea la llave foránea porque MySQL fallaría con errno 1452 sin señalar ' +
              'las filas. Corrige o reasigna esas checadas antes de volver a correr la migración.'
          )
        }
      }

      if (columna.esNullable) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` MODIFY COLUMN \`${COLUMNA}\` INT UNSIGNED NOT NULL`
        )
      }

      if (faltaLlaveForanea) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\`
             ADD CONSTRAINT \`${NOMBRE_LLAVE_FORANEA}\`
             FOREIGN KEY (\`${COLUMNA}\`) REFERENCES \`business_units\` (\`business_unit_id\`)
             ON DELETE RESTRICT ON UPDATE RESTRICT`
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      // Se retira por el nombre que tenga en BD, no por el esperado: si la llave se creó
      // con otro nombre, un `DROP FOREIGN KEY` con el nombre fijo fallaría.
      const llavesForaneas = await this.llavesForaneasDeLaColumna(db)

      for (const nombre of llavesForaneas) {
        await db.rawQuery(`ALTER TABLE \`${this.tableName}\` DROP FOREIGN KEY \`${nombre}\``)
      }

      const columna = await this.estadoDeLaColumna(db)

      if (columna.existe && !columna.esNullable) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\` MODIFY COLUMN \`${COLUMNA}\` INT UNSIGNED NULL`
        )
      }
    })
  }

  /** Existencia y nulabilidad actuales de la columna en el esquema activo. */
  private async estadoDeLaColumna(
    db: QueryClientContract
  ): Promise<{ existe: boolean; esNullable: boolean }> {
    const rows = await db.rawQuery(
      `SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, COLUMNA]
    )
    const fila = Array.isArray(rows) ? (rows[0] as Array<{ nullable: string }>)[0] : undefined

    return { existe: fila !== undefined, esNullable: fila?.nullable === 'YES' }
  }

  /**
   * Nombres de las llaves foráneas vivas sobre la columna. Se consulta por columna y no
   * por nombre para no crear una segunda FK equivalente si alguien la nombró distinto.
   */
  private async llavesForaneasDeLaColumna(db: QueryClientContract): Promise<string[]> {
    const rows = await db.rawQuery(
      `SELECT CONSTRAINT_NAME AS nombre FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [this.tableName, COLUMNA]
    )
    const filas = Array.isArray(rows) ? (rows[0] as Array<{ nombre: string }>) : []

    return filas.map((fila) => fila.nombre)
  }

  /** Ejecuta un `SELECT COUNT(*) AS total` y devuelve el conteo. */
  private async contar(db: QueryClientContract, sql: string): Promise<number> {
    const rows = await db.rawQuery(sql)

    return Array.isArray(rows) ? Number((rows[0] as Array<{ total: number }>)[0]?.total ?? 0) : 0
  }
}
