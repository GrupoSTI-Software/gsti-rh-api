import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega la marca de biométricos en sitio a la tabla `business_units`
 * (USRH1787189981872). Solo gobierna la visibilidad del apartado de
 * dispositivos en el panel de GSTI; no afecta la operación del cliente
 * ni el flujo de checadas.
 *
 * Valor inicial: 0 (apagado) para todas las empresas existentes — el
 * encendido es siempre un acto explícito del administrador de plataforma.
 */
export default class extends BaseSchema {
  protected tableName = 'business_units'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .tinyint('business_unit_has_biometrics')
        .notNullable()
        .defaultTo(0)
        .after('business_unit_origin')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('business_unit_has_biometrics')
    })
  }
}
