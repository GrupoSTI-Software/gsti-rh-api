import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca de pertenencia propia en las solicitudes de permiso.
 *
 * ## Por que
 * `exception_requests` no tenia `business_unit_id`: la pertenencia al tenant
 * era indirecta, a traves del empleado. Eso obligaba a que CADA consulta
 * escribiera su corte a mano —`whereIn('employee_id', scopedEmployeeIds())`— y
 * dejaba el aislamiento a merced de que alguien se acordara de ponerlo.
 *
 * El problema no es el olvido en si, es que falla en silencio: `scopedEmployeeIds`
 * solo filtra cuando hay contexto de tenant activo, asi que una ruta que naciera
 * fuera de `businessScope()` no reventaba —simplemente empezaba a devolver las
 * solicitudes de todas las empresas. Con la columna, el mixin
 * `withBusinessUnitScope` aplica el filtro por su cuenta en toda consulta del
 * modelo y el aislamiento deja de depender de la memoria de quien escribe la
 * siguiente query.
 *
 * Es el mismo cierre que ya se hizo en `shift_exceptions`
 * (1784300000027, USRH1784259058577) y en `exception_request_attachments`, que
 * nacio con su marca desde el principio.
 *
 * ## Guard de huerfanos
 * `employee_id` es NOT NULL en esta tabla, pero puede apuntar a un empleado que
 * ya no existe. Antes de exigir `NOT NULL` se cuenta: si hay filas sin empleado
 * resoluble, la migracion aborta y escala en vez de inventarles una empresa.
 *
 * ## Datos historicos
 * El backfill toma la empresa del empleado dueno e incluye las solicitudes
 * borradas logicamente: el `UPDATE` no filtra `*_deleted_at`, porque una fila
 * soft-deleted sin marca rompería el `NOT NULL`.
 */
export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      // 1) Guard: ninguna solicitud puede quedarse sin empresa resoluble.
      const orphanRows = await db.rawQuery(
        `SELECT COUNT(*) AS orphans
         FROM \`${this.tableName}\` child
         LEFT JOIN \`employees\` e ON e.employee_id = child.employee_id
         WHERE e.employee_id IS NULL`
      )
      const orphanCount = Number(orphanRows?.[0]?.[0]?.orphans ?? 0)

      if (orphanCount > 0) {
        throw new Error(
          `exception_requests: ${orphanCount} fila(s) sin empleado resoluble. ` +
            'Escalar a producto antes de exigir business_unit_id NOT NULL.'
        )
      }

      // 2) Backfill via el empleado dueno (incluye las soft-deleted).
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employees\` e ON e.employee_id = child.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      // 3) NOT NULL + index + FK.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`exception_requests_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`exception_requests_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'exception_requests_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'exception_requests_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
