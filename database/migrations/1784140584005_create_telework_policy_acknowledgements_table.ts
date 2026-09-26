import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Acuses de la Política de Teletrabajo (NOM-037-STPS-2023, numeral 5.2,
 * USRH1783547655377). Espejo de `user_consents` (evidencia legal LFPDPPP):
 * registro inmutable, sin soft delete, solo INSERT.
 *
 * El acto de firmar (el INSERT) lo hace la HU hermana ESB-08-07-02-03 desde
 * la app del teletrabajador; esta HU solo crea la tabla y la lee para el
 * seguimiento. `telework_policy_acknowledgement_signature_file_path` queda
 * nullable desde ya: guarda la Key relativa de S3 (subida privada) que la
 * hermana poblará al firmar.
 *
 * Sin `deleted_at`: un acuse jamás se corrige ni se elimina (regla de
 * negocio 8) — es la única prueba que acepta la STPS de que la política fue
 * conocida y aceptada.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_policy_acknowledgements'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_policy_acknowledgement_id').notNullable()

      table.integer('telework_policy_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table.timestamp('telework_policy_acknowledgement_acknowledged_at').notNullable()

      // Cifradas AES-256-CBC en reposo (LFPDPPP art. 3.VI); nunca en WHERE SQL.
      table.string('telework_policy_acknowledgement_ip', 191).nullable()
      table.text('telework_policy_acknowledgement_user_agent').nullable()

      // Key relativa de S3 (ACL private); la puebla la hermana ESB-08-07-02-03 al firmar.
      table.string('telework_policy_acknowledgement_signature_file_path', 255).nullable()

      table.timestamp('telework_policy_acknowledgement_created_at').notNullable()
      table.timestamp('telework_policy_acknowledgement_updated_at').nullable()

      table
        .foreign('telework_policy_id', 'fk_twpa_policy')
        .references('telework_policy_id')
        .inTable('telework_policies')
        .onDelete('RESTRICT')

      table
        .foreign('employee_id', 'fk_twpa_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('business_unit_id', 'fk_twpa_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      // Un acuse por teletrabajador y versión (regla de negocio 8): red de
      // seguridad contra el doble-tap de firma en la hermana ESB-08-07-02-03.
      table.unique(['employee_id', 'telework_policy_id'], {
        indexName: 'uq_twpa_employee_policy',
      })
      table.index(['telework_policy_id', 'employee_id'], 'idx_twpa_policy_employee')
      table.index(['business_unit_id'], 'idx_twpa_business_unit')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
