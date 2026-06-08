import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Anexo 15-D LFT (1:1 con contrato de servicios especializados).
 * ON DELETE CASCADE: al eliminar físicamente el contrato, cae el anexo.
 */
export default class extends BaseSchema {
  protected tableName = 'clausulas_15d'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('clausula_15d_id').notNullable()

      table
        .integer('contrato_servicio_especializado_id')
        .unsigned()
        .notNullable()
        .references('contrato_servicio_especializado_id')
        .inTable('contratos_servicios_especializados')
        .withKeyName('fk_clausula_15d_contrato')
        .onDelete('CASCADE')
        .unique()

      table.string('clausula_15d_folio_repse', 50).notNullable()
      table.text('clausula_15d_objeto_detallado').notNullable()
      table.integer('clausula_15d_numero_trabajadores_aprox').unsigned().notNullable()
      table.date('clausula_15d_fecha_inicio_servicio').notNullable()
      table.date('clausula_15d_fecha_fin_servicio').nullable()
      table.json('clausula_15d_compromisos_documentales').notNullable()
      table
        .boolean('clausula_15d_responsabilidad_solidaria_aceptada')
        .notNullable()
        .defaultTo(true)
      table.text('clausula_15d_texto_responsabilidad_solidaria').notNullable()

      table.timestamp('clausula_15d_created_at').notNullable().defaultTo(this.now())
      table.timestamp('clausula_15d_updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
