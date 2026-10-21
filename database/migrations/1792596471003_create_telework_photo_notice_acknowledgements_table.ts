import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Acuses del aviso de privacidad (VLRH-H1791306079310, §10): registro
 * inmutable, sin `updated_at` ni `deleted_at` —un acuse jamás se corrige ni se
 * elimina—, espejo de `telework_policy_acknowledgements`.
 *
 * Nace VACÍA aquí a propósito: es lo que hace existir el conteo de acuses por
 * versión desde el primer día. El INSERT lo hace la HU hermana
 * `VLRH-H1791311160825` desde la app, con su propio `employee_id` de sesión.
 *
 * `business_unit_id` se copia SIEMPRE del aviso, nunca del payload
 * (anti-IDOR), y es la marca que aísla el conteo entre empresas. La IP y el
 * user-agent se guardan cifrados AES-256-CBC en reposo (LFPDPPP art. 3.VI) y
 * nunca se usan en WHERE SQL.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_photo_notice_acknowledgements'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_photo_notice_acknowledgement_id')

      table.integer('telework_photo_notice_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table.timestamp('telework_photo_notice_acknowledgement_acknowledged_at').notNullable()

      // Cifradas AES-256-CBC en reposo (LFPDPPP art. 3.VI); nunca en WHERE SQL.
      table.string('telework_photo_notice_acknowledgement_ip', 191).nullable()
      table.text('telework_photo_notice_acknowledgement_user_agent').nullable()

      table.timestamp('telework_photo_notice_acknowledgement_created_at').notNullable()

      table
        .foreign('telework_photo_notice_id', 'fk_twpna_notice')
        .references('telework_photo_notice_id')
        .inTable('telework_photo_notices')
        .onDelete('RESTRICT')

      table
        .foreign('employee_id', 'fk_twpna_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('business_unit_id', 'fk_twpna_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      // Un acuse por aviso y colaborador: red de seguridad contra el
      // doble-tap de acuse en la HU hermana VLRH-H1791311160825.
      table.unique(['telework_photo_notice_id', 'employee_id'], {
        indexName: 'uq_twpna_notice_employee',
      })
      table.index(
        ['business_unit_id', 'employee_id'],
        'idx_twpna_business_unit_employee'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
