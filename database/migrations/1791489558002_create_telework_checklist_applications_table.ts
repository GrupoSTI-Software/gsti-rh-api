import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Aplicaciones de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870).
 *
 * Una fila por listado levantado (autoaplicado o en visita CSH). Sin soft
 * delete: el estado (`vigente`, `vencida`, `invalidada`, `reemplazada`) manda y
 * nada se borra. La columna generada
 * `telework_checklist_application_current_employee_id` con su `UNIQUE`
 * `uq_twca_current_employee` garantiza a lo sumo una lista vigente por
 * empleado; se agrega por DDL crudo porque Lucid no expone columnas generadas.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_checklist_applications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_checklist_application_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      // bigint unsigned (no int) para casar con el PK `bigIncrements` de
      // `employee_telework_locations`; un int haría la FK incompatible.
      table.bigInteger('employee_telework_location_id').unsigned().nullable()

      table
        .enum('telework_checklist_application_mode', ['autoaplicada', 'visita_csh'])
        .notNullable()

      table
        .enum('telework_checklist_application_status', [
          'vigente',
          'vencida',
          'invalidada',
          'reemplazada',
        ])
        .notNullable()
        .defaultTo('vigente')

      table
        .enum('telework_checklist_application_overall_result', ['aprobada', 'no_aprobada'])
        .notNullable()

      table.date('telework_checklist_application_applied_at').notNullable()
      table.tinyint('telework_checklist_application_revalidation_period_months').unsigned().notNullable()
      table.date('telework_checklist_application_expires_at').notNullable()
      table.string('telework_checklist_application_inspector_name', 150).nullable()
      table.text('telework_checklist_application_notes').nullable()

      table.integer('telework_checklist_application_applied_by_user_id').unsigned().notNullable()

      table.timestamp('telework_checklist_application_invalidated_at').nullable()
      table.string('telework_checklist_application_invalidation_reason', 50).nullable()
      table.integer('telework_checklist_application_invalidated_by_user_id').unsigned().nullable()

      table.timestamp('telework_checklist_application_created_at').notNullable()
      table.timestamp('telework_checklist_application_updated_at').nullable()

      table
        .foreign('business_unit_id', 'fk_twca_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign('employee_id', 'fk_twca_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('employee_telework_location_id', 'fk_twca_location')
        .references('employee_telework_location_id')
        .inTable('employee_telework_locations')
        .onDelete('RESTRICT')

      table
        .foreign('telework_checklist_application_applied_by_user_id', 'fk_twca_applied_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('telework_checklist_application_invalidated_by_user_id', 'fk_twca_invalidated_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.index(
        ['business_unit_id', 'employee_id', 'telework_checklist_application_applied_at'],
        'idx_twca_bu_employee_applied'
      )

      table.index(
        [
          'business_unit_id',
          'telework_checklist_application_status',
          'telework_checklist_application_expires_at',
        ],
        'idx_twca_bu_status_expires'
      )
    })

    this.schema.raw(
      `ALTER TABLE telework_checklist_applications
        ADD COLUMN telework_checklist_application_current_employee_id INT UNSIGNED
          GENERATED ALWAYS AS (CASE WHEN telework_checklist_application_status = 'vigente' THEN employee_id END) VIRTUAL,
        ADD UNIQUE KEY uq_twca_current_employee (telework_checklist_application_current_employee_id)`
    )
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
