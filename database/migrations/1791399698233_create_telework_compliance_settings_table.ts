import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajustes de teletrabajo por empresa (VLRH-H1791306074375).
 *
 * Guarda, por business unit, los montos mensuales por defecto de luz, internet
 * y cuota por uso de equipo propio, la periodicidad de revalidación (meses) y
 * la ventana de aviso (días). Es el cimiento de los consumidores del
 * teletrabajo por empresa (adenda, equipo propio, lista de verificación y
 * alertas) y el molde es `retention_policies`.
 *
 * Convenciones del repo aplicadas:
 *  - Tabla plural `telework_compliance_settings`; columnas con prefijo
 *    `telework_compliance_setting_`.
 *  - Unicidad en `business_unit_id` (a lo sumo un juego de ajustes por empresa);
 *    es también la red de la carrera de alta que protege `upsert`.
 *  - Auditoría de escritura en `created_by` / `updated_by` (FK a users).
 *  - Sin soft delete y sin ruta de borrado: la configuración se edita en sitio
 *    y la trazabilidad la da el snapshot del consumidor.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_compliance_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_compliance_setting_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()

      table
        .tinyint('telework_compliance_setting_revalidation_period_months')
        .unsigned()
        .notNullable()
        .defaultTo(12)

      table
        .smallint('telework_compliance_setting_expiration_notice_days')
        .unsigned()
        .notNullable()
        .defaultTo(30)

      table
        .decimal('telework_compliance_setting_electricity_allowance_default', 10, 2)
        .nullable()
      table.decimal('telework_compliance_setting_internet_allowance_default', 10, 2).nullable()
      table.decimal('telework_compliance_setting_own_equipment_fee_default', 10, 2).nullable()

      table.integer('telework_compliance_setting_created_by_user_id').unsigned().notNullable()
      table.integer('telework_compliance_setting_updated_by_user_id').unsigned().notNullable()

      table.timestamp('telework_compliance_setting_created_at').notNullable()
      table.timestamp('telework_compliance_setting_updated_at').nullable()

      table
        .foreign('business_unit_id', 'fk_tcs_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      table
        .foreign('telework_compliance_setting_created_by_user_id', 'fk_tcs_created_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('telework_compliance_setting_updated_by_user_id', 'fk_tcs_updated_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.unique(['business_unit_id'], { indexName: 'uq_tcs_business_unit' })
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
