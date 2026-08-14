import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre de IDOR vivo (USRH1786595131481) — `proceeding_file_type_property_values`
 * es la única tabla de datos de cliente de esta capacidad sin marca de
 * pertenencia: los 4 endpoints resuelven hoy por PK cruda, y el `update` con
 * archivo nuevo borra el objeto S3 anterior antes de sobrescribir, sin
 * verificar de quién es.
 *
 * El híbrido: cada fila cuelga de un expediente de empleado (`employee_id`
 * NOT NULL) o de un expediente de configuración de empresa (`employee_id`
 * NULL, formulario manda `systemSettingId` pero el validador lo descarta al
 * guardar — la unidad se pierde en el insert, no es un catálogo compartido).
 *
 * Backfill de 3 fuentes encadenadas, en orden de calidad decreciente
 * (D-1, Wilvardo): 1) `employees.business_unit_id` directo · 2)
 * `employee_proceeding_files.business_unit_id` (NOT NULL, rescata filas con
 * `employee_id` NULL cuyo expediente sí es de empleado) · 3)
 * `system_settings.business_unit_id` vía `system_setting_proceeding_files`
 * (rescata los valores de configuración de empresa). Todos los UPDATE llevan
 * `WHERE business_unit_id IS NULL` ⇒ idempotentes, re-corribles si el
 * rollout parcial falla.
 *
 * Pre-check bloqueante entre el último UPDATE y el DDL (regla 9): si algún
 * registro no resuelve dueño por ninguna de las 3 fuentes, la migración
 * aborta con `throw` y NO ejecuta el `MODIFY ... NOT NULL`. No se adivina,
 * no se asigna por omisión, no se deja NULL — se escala a Wilvardo.
 *
 * No se filtra `deleted_at` en el backfill (mismo criterio documentado en
 * `1783200000000_add_business_unit_id_to_employee_proceeding_files.ts`): el
 * `NOT NULL` aplica a toda la tabla, incluidas las filas soft-deleted.
 */
export default class extends BaseSchema {
  protected tableName = 'proceeding_file_type_property_values'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      // Fuente 1 (más directa): el empleado propio de la fila, cuando existe.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` v
         INNER JOIN \`employees\` e ON e.employee_id = v.employee_id
         SET v.business_unit_id = e.business_unit_id
         WHERE v.business_unit_id IS NULL`
      )

      // Fuente 2: el expediente de empleado al que cuelga (rescata filas con
      // employee_id NULL cuyo proceeding_file_id sí es de un empleado).
      // MIN() agrupado: si el expediente tiene más de un vínculo, el pre-check
      // #9 (fuera de esta migración, corrido antes de aplicar) confirma que
      // todos comparten la misma unidad antes de llegar aquí.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` v
         INNER JOIN (
           SELECT proceeding_file_id, MIN(business_unit_id) AS business_unit_id
           FROM \`employee_proceeding_files\`
           GROUP BY proceeding_file_id
         ) epf ON epf.proceeding_file_id = v.proceeding_file_id
         SET v.business_unit_id = epf.business_unit_id
         WHERE v.business_unit_id IS NULL`
      )

      // Fuente 3 (última, la que rescata configuración de empresa): el
      // expediente de configuración de empresa al que cuelga, vía el puente
      // system_setting_proceeding_files → system_settings.business_unit_id.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` v
         INNER JOIN (
           SELECT sspf.proceeding_file_id, MIN(ss.business_unit_id) AS business_unit_id
           FROM \`system_setting_proceeding_files\` sspf
           INNER JOIN \`system_settings\` ss ON ss.system_setting_id = sspf.system_setting_id
           WHERE ss.business_unit_id IS NOT NULL
           GROUP BY sspf.proceeding_file_id
         ) sspf ON sspf.proceeding_file_id = v.proceeding_file_id
         SET v.business_unit_id = sspf.business_unit_id
         WHERE v.business_unit_id IS NULL`
      )

      // Pre-check bloqueante (regla 9): 0 irresolubles o no se migra.
      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS orphan_count FROM \`${this.tableName}\` WHERE business_unit_id IS NULL`
      )
      const orphanRows = Array.isArray(rows) ? (rows as Array<{ orphan_count: number }>) : []
      const orphanCount = orphanRows[0]?.orphan_count ?? 0

      if (orphanCount > 0) {
        throw new Error(
          `proceeding_file_type_property_values: ${orphanCount} registro(s) sin business_unit_id ` +
            'resoluble por ninguna de las 3 fuentes (empleado, expediente de empleado, configuración ' +
            'de empresa) — escalar a Wilvardo antes de continuar. No se ejecutó el MODIFY NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`proceeding_file_type_property_values_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`proceeding_file_type_property_values_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'proceeding_file_type_property_values_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'proceeding_file_type_property_values_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
