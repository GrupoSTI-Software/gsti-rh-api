import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Plantilla base global de la Política de Teletrabajo (NOM-037-STPS-2023, numeral
 * 5.2). Documento de plataforma mantenido por GSTI (sembrado, sin pantalla de
 * administración): los 12 componentes obligatorios (incisos a-l) con su título y
 * texto modelo. Cada empresa la copia como punto de partida (USRH1783566072187).
 *
 * Espejo de `legal_documents`: sin `business_unit_id`, sin SoftDeletes. Solo una
 * fila vigente (`telework_policy_template_is_current = true`) a la vez.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_policy_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_policy_template_id')

      table.string('telework_policy_template_version', 20).notNullable()
      table.json('telework_policy_template_components').notNullable()
      table.boolean('telework_policy_template_is_current').notNullable().defaultTo(true)

      table.timestamp('telework_policy_template_created_at').notNullable()
      table.timestamp('telework_policy_template_updated_at').nullable()

      table.index(
        ['telework_policy_template_is_current'],
        'telework_policy_templates_current_index'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
