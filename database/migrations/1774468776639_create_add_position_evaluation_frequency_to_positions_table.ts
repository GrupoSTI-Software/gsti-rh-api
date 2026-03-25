import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'positions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('position_evaluation_frequency', 
          ['diario', 'semanal', 'cada 2 semanas', 'mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual'])
        .after('position_specific_requirement')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_evaluation_frequency')
    })
  }
}

