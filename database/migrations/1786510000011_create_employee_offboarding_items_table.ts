import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pendientes del expediente de salida (USRH1786568279587): un renglón por
 * concepto activo del catálogo de la empresa y por activo asignado al
 * colaborador, generados UNA sola vez al abrir el expediente (regla 3).
 *
 * `employee_offboarding_item_name` es SNAPSHOT del nombre del concepto o del
 * insumo al momento de generarse (§7 D9): renombrar, desactivar o eliminar
 * el concepto después no reescribe expedientes viejos. Las FKs a concepto e
 * insumo quedan nullable para poder llegar al origen (USRH1786568279590 las
 * usa para el retiro del inventario); el nombre mostrado siempre sale del
 * snapshot.
 *
 * Importe, nota y cumplimiento nacen aquí pero solo los escribe
 * USRH1786568279590. `decimal(12,2)` por el veredicto del censo; nunca
 * `double` (normalizar con `Number()` en el DTO: algunos drivers devuelven
 * DECIMAL como string).
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_offboarding_item_id').notNullable()

      table.integer('employee_offboarding_id').unsigned().notNullable()
      table.foreign('employee_offboarding_id', 'fk_emp_offb_item_offb')
        .references('employee_offboarding_id')
        .inTable('employee_offboardings')
        .onDelete('CASCADE')

      table.integer('offboarding_concept_id').unsigned().nullable()
      table.foreign('offboarding_concept_id', 'fk_emp_offb_item_concept')
        .references('offboarding_concept_id')
        .inTable('offboarding_concepts')
        .onDelete('SET NULL')

      table.integer('employee_supply_id').unsigned().nullable()
      table.foreign('employee_supply_id', 'fk_emp_offb_item_supply')
        .references('employee_supply_id')
        .inTable('employee_supplies')
        .onDelete('SET NULL')

      table.string('employee_offboarding_item_name', 200).notNullable()

      // 'pending' | 'completed' — en esta HU todos nacen 'pending' y nadie los cambia
      table.string('employee_offboarding_item_status', 20).notNullable().defaultTo('pending')

      table.decimal('employee_offboarding_item_amount', 12, 2).nullable()
      table.text('employee_offboarding_item_note').nullable()
      table.datetime('employee_offboarding_item_completed_at').nullable()

      table.integer('employee_offboarding_item_completed_by_user_id').unsigned().nullable()
      table.foreign('employee_offboarding_item_completed_by_user_id', 'fk_emp_offb_item_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.datetime('employee_offboarding_item_created_at').notNullable()
      table.datetime('employee_offboarding_item_updated_at').nullable()
      table.datetime('employee_offboarding_item_deleted_at').nullable()

      table.index(
        ['employee_offboarding_id', 'employee_offboarding_item_deleted_at'],
        'idx_emp_offb_item_offb'
      )
      // Apoya ConceptsService.isInUse (regla 13): fila viva por concepto
      table.index(
        ['offboarding_concept_id', 'employee_offboarding_item_deleted_at'],
        'idx_emp_offb_item_concept'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
