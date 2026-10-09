import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Respuestas de cada punto en una aplicación de la lista de verificación de
 * teletrabajo (VLRH-H1790812613870).
 *
 * Sin soft delete y sin `updated_at`: la respuesta nace con la aplicación y no
 * se edita. El `UNIQUE` `uq_twcans_application_item` impide dos respuestas del
 * mismo punto en la misma aplicación. `business_unit_id` replica el de la
 * aplicación padre para el aislamiento por empresa.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_checklist_answers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_checklist_answer_id').notNullable()

      table.integer('telework_checklist_application_id').unsigned().notNullable()
      table.integer('telework_checklist_item_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table
        .enum('telework_checklist_answer_result', ['cumple', 'no_cumple', 'no_aplica'])
        .notNullable()

      table.text('telework_checklist_answer_observation').nullable()
      table.timestamp('telework_checklist_answer_created_at').notNullable()

      table
        .foreign('telework_checklist_application_id', 'fk_twcans_application')
        .references('telework_checklist_application_id')
        .inTable('telework_checklist_applications')
        .onDelete('RESTRICT')

      table
        .foreign('telework_checklist_item_id', 'fk_twcans_item')
        .references('telework_checklist_item_id')
        .inTable('telework_checklist_items')
        .onDelete('RESTRICT')

      table
        .foreign('business_unit_id', 'fk_twcans_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.unique(
        ['telework_checklist_application_id', 'telework_checklist_item_id'],
        { indexName: 'uq_twcans_application_item' }
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
