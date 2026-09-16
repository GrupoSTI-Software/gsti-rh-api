import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Columna que se endurece. */
const COLUMNA = 'business_unit_id'

/** Nombre con el que la M3 original creó la llave foránea; se conserva para no duplicarla. */
const NOMBRE_LLAVE_FORANEA = 'assists_business_unit_id_foreign'

/**
 * Nombre de archivo de la M3 original, tal como quedó registrada en
 * `adonis_schema` en las bases que deployearon entre 591044e1 y fab69b76. Es la
 * marca con la que `down()` sabe que el endurecimiento no es suyo.
 */
const NOMBRE_MIGRACION_VIEJA = '1786566437097002_enforce_not_null_business_unit_id_on_assists'

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
      // El down solo deshace lo que ESTE archivo pudo haber hecho. En una base
      // donde corrió la M3 vieja, el endurecimiento es suyo y `up()` salió por
      // el early-return sin tocar nada: desendurecer aquí dejaría la tabla MÁS
      // débil de lo que estaba antes de que esta migración existiera, y como la
      // M3 vieja sigue registrada en `adonis_schema`, nada la volvería a
      // aplicar. Ante esa marca, no-op.
      if (await this.corrioLaMigracionVieja(db)) return

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

  /**
   * ¿La M3 original llegó a correr en esta base? Se pregunta por su nombre en
   * `adonis_schema`, que es la clave con la que Lucid registra cada migración.
   */
  private async corrioLaMigracionVieja(db: QueryClientContract): Promise<boolean> {
    const total = await this.contar(
      db,
      'SELECT COUNT(*) AS total FROM `adonis_schema` WHERE `name` LIKE ?',
      [`%${NOMBRE_MIGRACION_VIEJA}`]
    )

    return total > 0
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
    // Se filtra por la tabla y la columna REFERENCIADAS, no solo por "tiene
    // referencia": una FK de esta columna hacia otra tabla haría creer a `up()`
    // que la llave contra `business_units` ya existe —y nunca la crearía— y
    // haría que `down()` soltara una llave que este archivo no creó.
    const rows = await db.rawQuery(
      `SELECT CONSTRAINT_NAME AS nombre FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
         AND REFERENCED_TABLE_NAME = 'business_units'
         AND REFERENCED_COLUMN_NAME = 'business_unit_id'`,
      [this.tableName, COLUMNA]
    )
    const filas = Array.isArray(rows) ? (rows[0] as Array<{ nombre: string }>) : []

    return filas.map((fila) => fila.nombre)
  }

  /**
   * Ejecuta un `SELECT COUNT(*) AS total` y devuelve el conteo.
   *
   * Falla RUIDOSO ante una forma inesperada, igual que `estadoDeLaColumna`: un
   * 0 silencioso desarmaría las dos guardas que protegen los datos (cuarentena
   * y huérfanos) y la migración pasaría derecho al `MODIFY ... NOT NULL`. Sin
   * `sql_mode` estricto, MySQL reescribiría cada NULL a 0 —la pertenencia
   * inventada que la cabecera promete no inventar— y después la FK reventaría
   * con errno 1452 dejando la tabla a medio migrar.
   */
  private async contar(
    db: QueryClientContract,
    sql: string,
    bindings: readonly string[] = []
  ): Promise<number> {
    const rows = await db.rawQuery(sql, [...bindings])
    const total = Array.isArray(rows)
      ? (rows[0] as Array<{ total: number }>)[0]?.total
      : undefined

    if (typeof total !== 'number' && typeof total !== 'string') {
      throw new Error(
        'assists: no se pudo leer el conteo de la guarda; se aborta sin tocar el esquema.'
      )
    }

    return Number(total)
  }
}
