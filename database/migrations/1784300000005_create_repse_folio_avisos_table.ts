import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de avisos automáticos de vigencia del folio REPSE (renovación
 * trienal e informativas cuatrimestrales). Sirve como mecanismo de
 * **idempotencia** del comando `repse:notify-folio-expiring`: el UNIQUE
 * `(repse_registration_id, repse_folio_aviso_tipo, repse_folio_aviso_periodo_clave)`
 * impide que el mismo registro reciba dos veces el mismo aviso del mismo
 * periodo.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_folio_avisos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('repse_folio_aviso_id').notNullable()

      table.integer('repse_registration_id').unsigned().notNullable()

      /**
       * Catálogo cerrado en app: `renovacion` | `informativa`.
       * `varchar(20)` admite tipos futuros sin migrar.
       */
      table.string('repse_folio_aviso_tipo', 20).notNullable()

      /**
       * Distingue eventos del mismo tipo entre periodos (ej. `2026-RENOV`,
       * `2026-C1`). Alimenta el UNIQUE de idempotencia.
       */
      table.string('repse_folio_aviso_periodo_clave', 20).notNullable()

      /** Momento real del envío (semántico, además de `_created_at`). */
      table.dateTime('repse_folio_aviso_enviado_en').notNullable()

      table.timestamp('repse_folio_aviso_created_at').notNullable()
      table.timestamp('repse_folio_aviso_updated_at').nullable()
      table.timestamp('repse_folio_aviso_deleted_at').nullable()

      table
        .foreign('repse_registration_id', 'fk_rfa_registration')
        .references('repse_registration_id')
        .inTable('repse_registrations')
        .onDelete('CASCADE')

      table.unique(
        ['repse_registration_id', 'repse_folio_aviso_tipo', 'repse_folio_aviso_periodo_clave'],
        'uq_rfa_reg_tipo_periodo'
      )

      table.index(['repse_folio_aviso_tipo'], 'idx_rfa_tipo')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
