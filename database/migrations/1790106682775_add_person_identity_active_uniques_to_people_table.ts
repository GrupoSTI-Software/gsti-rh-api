import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unicidad de RFC, CURP y NSS por empresa entre expedientes vivos (USRH1789698261610).
 *
 * Patrón columna generada + UNIQUE compuesto, nunca UNIQUE plano: un UNIQUE plano
 * sobre la huella dejaría el dato ocupado para siempre al dar de baja (la fila
 * conserva su huella); es el defecto que hizo retirar reglas en 2024. La expresión
 * devuelve NULL en borradas, en vacías y la columna empresa ya es NULL en filas
 * sin empresa; MySQL trata cada NULL como distinto, así que N borradas comparten
 * dato (regla 4), vaciar libera (regla 7) y las filas sin empresa quedan fuera
 * de la regla (regla 8), todo por construcción y sin código.
 *
 * VIRTUAL, no STORED: el índice secundario materializa igual y el ALTER es solo
 * metadatos. Sin COLLATE explícito: se hereda el de la huella.
 *
 * El censo va en `this.defer` registrado PRIMERO: en MySQL cada ALTER TABLE hace
 * commit implícito y un aborto posterior dejaría la tabla a medias. El aborto no
 * proyecta ningún valor en claro (ni completo ni enmascarado): lista empresa,
 * conteo y person_id. No corrige, no borra, no fusiona (regla 9).
 *
 * Resolución manual si aborta: identificar cada grupo por person_id, descifrar
 * por REPL (solo lectura) y decidir del lado del cliente. Si el valor en claro
 * está vacío pero la huella no es NULL, es una huella huérfana del defecto que
 * corrige `calculateIdentifierHashes`: poner esa columna `person_*_hash` a NULL
 * por SQL (es dato derivado, no información del expediente) y reintentar.
 */

const TABLE = 'people'

const GENERATED: ReadonlyArray<{ active: string; hash: string }> = [
  { active: 'person_rfc_active', hash: 'person_rfc_hash' },
  { active: 'person_curp_active', hash: 'person_curp_hash' },
  { active: 'person_imss_nss_active', hash: 'person_imss_nss_hash' },
]

const LABELS: Record<string, string> = {
  person_rfc_hash: 'RFC',
  person_curp_hash: 'CURP',
  person_imss_nss_hash: 'NSS',
}

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — censo de vivos de una misma empresa compartiendo huella (ANTES de cualquier DDL).
    this.defer(async (db) => {
      await db.rawQuery('SET SESSION group_concat_max_len = 1000000')
      type DupRow = { empresa: number; total: number; personas: string }
      const conflicts: string[] = []
      for (const { hash } of GENERATED) {
        const [rows] = await db.rawQuery<[DupRow[]]>(
          `SELECT \`business_unit_id\` AS empresa,
                  COUNT(*) AS total,
                  GROUP_CONCAT(CONCAT('person_id=', \`person_id\`) ORDER BY \`person_id\` SEPARATOR ', ') AS personas
           FROM \`${TABLE}\`
           WHERE \`person_deleted_at\` IS NULL
             AND \`business_unit_id\` IS NOT NULL
             AND \`${hash}\` IS NOT NULL
             AND \`${hash}\` != ''
           GROUP BY \`business_unit_id\`, \`${hash}\`
           HAVING COUNT(*) > 1
           ORDER BY empresa`
        )
        for (const row of rows) {
          conflicts.push(`  - x${row.total} ${LABELS[hash]} empresa=${row.empresa} -> ${row.personas}`)
        }
      }
      if (conflicts.length === 0) return
      throw new Error(
        '[USRH1789698261610] Expedientes vivos de una misma empresa compartiendo RFC, CURP o NSS — resolver manualmente antes de continuar:\n' +
          `${conflicts.join('\n')}\n` +
          'No se aplicó ningún cambio. Diagnóstico sin proyectar valores (solo ids):\n' +
          '  SELECT person_id, business_unit_id, person_deleted_at FROM `people` WHERE person_id IN (...);'
      )
    })

    // Paso 2 — columnas generadas VIRTUAL.
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD COLUMN `person_rfc_active` VARCHAR(64)\n' +
        '        GENERATED ALWAYS AS (\n' +
        '          CASE WHEN `person_deleted_at` IS NULL\n' +
        '                AND `person_rfc_hash` IS NOT NULL\n' +
        '                AND `person_rfc_hash` != ' +
        "''" +
        '\n' +
        '               THEN `person_rfc_hash`\n' +
        '               ELSE NULL END\n' +
        '        ) VIRTUAL'
    )
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD COLUMN `person_curp_active` VARCHAR(64)\n' +
        '        GENERATED ALWAYS AS (\n' +
        '          CASE WHEN `person_deleted_at` IS NULL\n' +
        '                AND `person_curp_hash` IS NOT NULL\n' +
        '                AND `person_curp_hash` != ' +
        "''" +
        '\n' +
        '               THEN `person_curp_hash`\n' +
        '               ELSE NULL END\n' +
        '        ) VIRTUAL'
    )
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD COLUMN `person_imss_nss_active` VARCHAR(64)\n' +
        '        GENERATED ALWAYS AS (\n' +
        '          CASE WHEN `person_deleted_at` IS NULL\n' +
        '                AND `person_imss_nss_hash` IS NOT NULL\n' +
        '                AND `person_imss_nss_hash` != ' +
        "''" +
        '\n' +
        '               THEN `person_imss_nss_hash`\n' +
        '               ELSE NULL END\n' +
        '        ) VIRTUAL'
    )

    // Paso 3 — índices UNIQUE compuestos por empresa.
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD UNIQUE KEY `people_rfc_company_unique` (`business_unit_id`, `person_rfc_active`)'
    )
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD UNIQUE KEY `people_curp_company_unique` (`business_unit_id`, `person_curp_active`)'
    )
    this.schema.raw(
      'ALTER TABLE `people`\n' +
        '      ADD UNIQUE KEY `people_imss_nss_company_unique` (`business_unit_id`, `person_imss_nss_active`)'
    )
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      const [rfcIdxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = 'people_rfc_company_unique'`
      )
      if ((rfcIdxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`people_rfc_company_unique\``)
      }
      const [curpIdxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = 'people_curp_company_unique'`
      )
      if ((curpIdxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`people_curp_company_unique\``)
      }
      const [nssIdxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = 'people_imss_nss_company_unique'`
      )
      if ((nssIdxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`people_imss_nss_company_unique\``)
      }
      const [rfcColRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = 'person_rfc_active'`
      )
      if ((rfcColRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`person_rfc_active\``)
      }
      const [curpColRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = 'person_curp_active'`
      )
      if ((curpColRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`person_curp_active\``)
      }
      const [nssColRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = 'person_imss_nss_active'`
      )
      if ((nssColRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`person_imss_nss_active\``)
      }
    })
  }
}
