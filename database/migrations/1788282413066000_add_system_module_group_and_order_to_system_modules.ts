import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Traslado del grupo de texto al FK de catálogo en system_modules —
 * migración B (USRH1788282413065).
 *
 * Secuencia obligatoria §9.3:
 *   B1 guarda de valor desconocido (ANTES de cualquier DDL)
 *   B2 ADD columnas nullable
 *   B3 backfill FK + orden
 *   B4 guarda de huérfanos (última oportunidad con la columna vieja viva)
 *   B5 endurecer orden + ADD índice + ADD FK RESTRICT
 *   B6 DROP columna vieja (punto de no retorno)
 *
 * En MySQL cada ALTER TABLE hace commit implícito: no hay rollback
 * transaccional.  Por eso B1 corre ANTES de todo DDL mediante this.defer
 * registrado primero (molde 1787932877000000:18-21).
 *
 * Lista congelada al 2026-09-01 — no se importa ninguna constante viva.
 */

const TABLE = 'system_modules'
const GROUPS_TABLE = 'system_module_groups'

/**
 * Mapa congelado texto crudo → clave (§4.1).
 * No se calcula en ejecución: una collation distinta o un localeCompare
 * diferente darían resultados dependientes del entorno.
 */
const TEXT_TO_KEY: Record<string, string> = {
  '1. Reportes': 'reportes',
  '2. Empresa': 'empresa',
  '3. Calendarios': 'calendarios',
  '4. Configuraciones': 'configuraciones',
  '5. NOM-035': 'nom-035',
  '5. Otros': 'otros',
  '6. ZKSync': 'zksync',
  '7. NOM-037': 'nom-037',
  '7. Plataforma': 'plataforma',
}

/** Inverso del mapa anterior — usado por el down() para reconstruir. */
const KEY_TO_TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(TEXT_TO_KEY).map(([text, key]) => [key, text])
)

const KNOWN_TEXTS = Object.keys(TEXT_TO_KEY)

export default class extends BaseSchema {
  async up() {
    // B1 — guarda de valor desconocido ANTES de cualquier DDL.
    // Registrado primero → corre primero en trackedCalls.
    // Si hay valores fuera del catálogo, lanza nombrando cada uno y sus slugs
    // sin haber tocado ninguna columna (CA4).
    this.defer(async (db) => {
      type UnknownRow = { system_module_group: string; slugs: string }
      const placeholders = KNOWN_TEXTS.map(() => '?').join(', ')
      const [rows] = await db.rawQuery<[UnknownRow[]]>(
        `SELECT
           system_module_group,
           GROUP_CONCAT(system_module_slug ORDER BY system_module_slug SEPARATOR ', ') AS slugs
         FROM \`${TABLE}\`
         WHERE system_module_group NOT IN (${placeholders})
         GROUP BY system_module_group
         ORDER BY system_module_group`,
        KNOWN_TEXTS
      )

      if (rows.length === 0) return

      const lines = rows
        .map((r) => `  - "${r.system_module_group}" → módulos: ${r.slugs}`)
        .join('\n')
      throw new Error(
        '[USRH1788282413065] Valores de system_module_group fuera del catálogo conocido.\n' +
          'Corregir el valor en la BD antes de relanzar esta migración:\n' +
          `${lines}`
      )
    })

    // B2 — ADD columnas nullable: única forma de que el ALTER no falle sobre
    // las ~51 filas existentes (R-02).  Molde 1783300000001:14.
    this.schema.alterTable(TABLE, (table) => {
      table
        .integer('system_module_group_id')
        .unsigned()
        .nullable()
        .after('system_module_group')
      table.smallint('system_module_order').unsigned().nullable()
    })

    // B3 — backfill: asignar FK y orden.  Reentrante por los IS NULL
    // (molde 1783300000001:17-23).
    this.defer(async (db) => {
      for (const [text, key] of Object.entries(TEXT_TO_KEY)) {
        await db.rawQuery(
          `UPDATE \`${TABLE}\` m
           JOIN \`${GROUPS_TABLE}\` g
             ON g.system_module_group_key = ?
            AND g.system_module_group_deleted_at IS NULL
           SET m.system_module_group_id = g.system_module_group_id
           WHERE m.system_module_group = ?
             AND m.system_module_group_id IS NULL`,
          [key, text]
        )
      }

      // El orden se toma de system_module_id * 10: preserva el menú visible
      // (app/services/system_module_service.ts:11 ordena por system_module_id)
      // y deja hueco para intercalar (§9.2).
      await db.rawQuery(
        `UPDATE \`${TABLE}\`
         SET system_module_order = system_module_id * 10
         WHERE system_module_order IS NULL`
      )
    })

    // B4 — guarda de huérfanos: última oportunidad con la columna vieja viva.
    // Si algún módulo quedó sin grupo se lanza nombrando id y slug (CA5),
    // sin haber endurecido el orden, sin haber creado la FK, sin haber
    // retirado system_module_group.
    this.defer(async (db) => {
      type OrphanRow = { system_module_id: number; system_module_slug: string }
      const [rows] = await db.rawQuery<[OrphanRow[]]>(
        `SELECT system_module_id, system_module_slug
         FROM \`${TABLE}\`
         WHERE system_module_group_id IS NULL
         ORDER BY system_module_id`
      )

      if (rows.length === 0) return

      const lines = rows
        .map((r) => `  - id=${r.system_module_id} slug="${r.system_module_slug}"`)
        .join('\n')
      throw new Error(
        '[USRH1788282413065] Módulos sin grupo tras el backfill — resolver antes de continuar:\n' +
          `${lines}`
      )
    })

    // B5 — endurecer: system_module_order NOT NULL, índice + FK RESTRICT.
    // system_module_group_id se queda nullable (R-03: módulo suelto es válido).
    // Molde 1783300000001:25-31.
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${TABLE}\`
         MODIFY COLUMN \`system_module_order\` SMALLINT UNSIGNED NOT NULL,
         ADD INDEX \`system_modules_system_module_group_id_index\`
           (\`system_module_group_id\`),
         ADD CONSTRAINT \`system_modules_system_module_group_id_foreign\`
           FOREIGN KEY (\`system_module_group_id\`)
           REFERENCES \`${GROUPS_TABLE}\` (\`system_module_group_id\`)
           ON DELETE RESTRICT`
      )
    })

    // B6 — punto de no retorno: retirar la columna vieja.
    // Último por construcción (§9.4).
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${TABLE}\` DROP COLUMN \`system_module_group\``
      )
    })
  }

  /**
   * B7 — Reconstrucción declarada (CA8, RC-08).
   *
   * El texto original ya no existe: se reconstruye desde el mapa congelado vía
   * la FK.  Los módulos sin grupo o con grupo dado de baja reciben '5. Otros'
   * y quedan anotados en el log.  El down() consulta information_schema antes
   * de cada paso para no fallar sobre estado parcial
   * (molde 1787932877000000:101-129).
   */
  async down() {
    this.defer(async (db) => {
      type CountRow = { cnt: number }

      const colExists = async (col: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND column_name = ?`,
          [TABLE, col]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      const idxExists = async (idx: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND index_name = ?`,
          [TABLE, idx]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      const fkExists = async (fk: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND constraint_name = ?
             AND constraint_type = 'FOREIGN KEY'`,
          [TABLE, fk]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      // Quitar FK si existe.
      if (await fkExists('system_modules_system_module_group_id_foreign')) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\`
           DROP FOREIGN KEY \`system_modules_system_module_group_id_foreign\``
        )
      }

      // Quitar índice si existe.
      if (await idxExists('system_modules_system_module_group_id_index')) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\`
           DROP INDEX \`system_modules_system_module_group_id_index\``
        )
      }

      // Aflojar order a nullable si ya fue endurecido.
      if (await colExists('system_module_order')) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\`
           MODIFY COLUMN \`system_module_order\` SMALLINT UNSIGNED NULL`
        )
      }

      // Recrear columna vieja nullable si fue retirada (B6).
      if (!(await colExists('system_module_group'))) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\`
           ADD COLUMN \`system_module_group\` VARCHAR(45) NULL
           AFTER \`system_module_group_id\``
        )
      }

      // Repoblar desde el mapa congelado vía la FK.
      for (const [key, text] of Object.entries(KEY_TO_TEXT)) {
        await db.rawQuery(
          `UPDATE \`${TABLE}\` m
           JOIN \`${GROUPS_TABLE}\` g
             ON g.system_module_group_id = m.system_module_group_id
            AND g.system_module_group_key = ?
           SET m.system_module_group = ?`,
          [key, text]
        )
      }

      // Módulos sueltos o con grupo dado de baja → '5. Otros' + log.
      type OrphanRow = { system_module_id: number; system_module_slug: string }
      const [orphans] = await db.rawQuery<[OrphanRow[]]>(
        `SELECT system_module_id, system_module_slug
         FROM \`${TABLE}\`
         WHERE system_module_group IS NULL
         ORDER BY system_module_id`
      )
      if (orphans.length > 0) {
        const list = orphans
          .map((o) => `id=${o.system_module_id} slug="${o.system_module_slug}"`)
          .join(', ')
        console.warn(
          `[USRH1788282413065 down] Módulos sin grupo reconstruido → reciben "5. Otros": ${list}`
        )
        await db.rawQuery(
          `UPDATE \`${TABLE}\`
           SET system_module_group = '5. Otros'
           WHERE system_module_group IS NULL`
        )
      }

      // Endurecer a NOT NULL ahora que toda fila tiene valor.
      await db.rawQuery(
        `ALTER TABLE \`${TABLE}\`
         MODIFY COLUMN \`system_module_group\` VARCHAR(45) NOT NULL`
      )

      // Quitar columnas nuevas si existen.
      if (await colExists('system_module_group_id')) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\` DROP COLUMN \`system_module_group_id\``
        )
      }
      if (await colExists('system_module_order')) {
        await db.rawQuery(
          `ALTER TABLE \`${TABLE}\` DROP COLUMN \`system_module_order\``
        )
      }
    })
  }
}
