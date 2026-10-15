import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1790812613831 — checadores pendientes de sincronizar al reactivar.
 *
 * Una marca por vínculo colaborador↔checador del que la baja sacó a la persona
 * y que sigue sin resolverse tras deshacerla. Nace abierta en la reactivación y
 * se cierra por estado (`assigned`, `superseded`); nunca se borra. La columna
 * generada VIRTUAL `open_key` vale 1 mientras la marca está abierta y NULL al
 * cerrarse: el UNIQUE sobre (vínculo, open_key) impide dos marcas abiertas del
 * mismo vínculo sin estorbar al historial de cerradas (molde
 * 1790017215301_create_add_is_default_to_branch_offices_table). Se crea con
 * `raw` porque Knex no expone columnas generadas virtuales en MySQL.
 *
 * FK en cascada hacia colaborador y vínculo: la marca es dato derivado y no
 * debe bloquear `deleteAllEmployees`. Sin borrado lógico.
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_resync_pendings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_resync_pending_id')
      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('access_point_employee_id').unsigned().notNullable()
      // Estado del vínculo al reactivar: rastro para aclarar después
      table.string('access_point_resync_pending_status_at_mark', 20).notNullable()
      table.integer('access_point_resync_pending_marked_by_user_id').unsigned().nullable()
      table.timestamp('access_point_resync_pending_resolved_at').nullable()
      // 'assigned' | 'superseded'; el conjunto vive en resync_pending.constants.ts
      table.string('access_point_resync_pending_resolution', 20).nullable()
      table.timestamp('access_point_resync_pending_created_at').notNullable().defaultTo(this.now())
      table.timestamp('access_point_resync_pending_updated_at').nullable()

      table
        .foreign('business_unit_id', 'fk_ap_resync_bu')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
      table
        .foreign('employee_id', 'fk_ap_resync_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table
        .foreign('access_point_employee_id', 'fk_ap_resync_pivot')
        .references('access_point_employee_id')
        .inTable('access_point_employees')
        .onDelete('CASCADE')
      table
        .foreign('access_point_resync_pending_marked_by_user_id', 'fk_ap_resync_marked_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.index(
        ['employee_id', 'access_point_resync_pending_resolved_at'],
        'idx_ap_resync_employee_open'
      )
    })

    // Columna generada: 1 mientras la marca está abierta, NULL al cerrarse
    this.schema.raw(`
      ALTER TABLE \`${this.tableName}\`
      ADD COLUMN \`access_point_resync_pending_open_key\` TINYINT
        GENERATED ALWAYS AS (
          CASE WHEN \`access_point_resync_pending_resolved_at\` IS NULL THEN 1 ELSE NULL END
        ) VIRTUAL
    `)

    // Nunca dos marcas abiertas del mismo vínculo (regla 5)
    this.schema.raw(`
      ALTER TABLE \`${this.tableName}\`
      ADD UNIQUE KEY \`uq_ap_resync_pivot_open\`
        (\`access_point_employee_id\`, \`access_point_resync_pending_open_key\`)
    `)
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
