import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599).
 *
 * La tabla nace completa: incluye las columnas que solo escriben las historias
 * de ajuste (`end_date`, `fee_source` ajustado, el cierre con `closed_reason` y
 * `closed_by_user_id`) y la de evidencia (`file`), porque ninguna de ellas
 * vuelve a migrar. Las FKs sin cascada son RESTRICT: impiden el borrado en
 * duro del colaborador (o de la empresa) mientras tenga declaraciones, y así
 * conservan la evidencia (NOM-037 10.4).
 *
 * El UNIQUE de a lo sumo una declaración vigente por colaborador y categoría
 * va sobre la columna generada `..._open_flag`, creada FUERA del callback de
 * `createTable` porque Knex no expone `generatedAs` para columnas virtuales en
 * MySQL. La expresión vale NULL al cerrar (o borrar lógicamente), y MySQL
 * admite varios NULL en un índice: cerrar o dar de baja libera el slot.
 * `down` no necesita deshacer el UNIQUE ni la columna: `dropTable` se los lleva.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_own_equipment_declarations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_own_equipment_declaration_id').notNullable()

      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table
        .enum('employee_own_equipment_declaration_category', [
          'ergonomic_chair',
          'computing_equipment',
          'accessory',
        ])
        .notNullable()
      table.string('employee_own_equipment_declaration_description', 255).notNullable()
      table.text('employee_own_equipment_declaration_conditions').nullable()
      table.date('employee_own_equipment_declaration_start_date').notNullable()
      table.date('employee_own_equipment_declaration_end_date').nullable()
      table.decimal('employee_own_equipment_declaration_monthly_fee', 10, 2).notNullable()
      table
        .enum('employee_own_equipment_declaration_fee_source', ['default', 'adjusted'])
        .notNullable()
      table.string('employee_own_equipment_declaration_file', 500).nullable()
      table
        .enum('employee_own_equipment_declaration_status', ['active', 'closed'])
        .notNullable()
        .defaultTo('active')
      table.string('employee_own_equipment_declaration_closed_reason', 30).nullable()
      table
        .integer('employee_own_equipment_declaration_created_by_user_id')
        .unsigned()
        .notNullable()
      table
        .integer('employee_own_equipment_declaration_closed_by_user_id')
        .unsigned()
        .nullable()
      table.timestamp('employee_own_equipment_declaration_created_at').notNullable()
      table.timestamp('employee_own_equipment_declaration_updated_at').nullable()
      table.timestamp('employee_own_equipment_declaration_deleted_at').nullable()

      table
        .foreign('employee_id', 'fk_eoed_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('business_unit_id', 'fk_eoed_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign(
          'employee_own_equipment_declaration_created_by_user_id',
          'fk_eoed_created_by_user'
        )
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('employee_own_equipment_declaration_closed_by_user_id', 'fk_eoed_closed_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['business_unit_id', 'employee_id'], 'idx_eoed_bu_employee')
    })

    this.schema.raw(`
      ALTER TABLE \`employee_own_equipment_declarations\`
      ADD COLUMN \`employee_own_equipment_declaration_open_flag\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`employee_own_equipment_declaration_status\` = 'active'
                AND \`employee_own_equipment_declaration_deleted_at\` IS NULL
               THEN 1 ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`employee_own_equipment_declarations\`
      ADD UNIQUE KEY \`uq_eoed_employee_category_open\` (
        \`employee_id\`,
        \`employee_own_equipment_declaration_category\`,
        \`employee_own_equipment_declaration_open_flag\`
      )
    `)
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
