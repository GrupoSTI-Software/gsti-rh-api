import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Comisión de alianza devengada al registrar un pago
 * (ESB-07-09-09-09). Append-only: no se corrige ni se borra.
 *
 * Un pago genera como máximo una comisión (UNIQUE de
 * `billing_payment_id`). Los periodos devengados de una atribución
 * se suman de aquí; no hay contador en la atribución.
 *
 * Sin `await this.schema`.
 */
export default class extends BaseSchema {
  protected tableName = 'alliance_commissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('alliance_commission_id').notNullable()

      table
        .integer('alliance_id')
        .unsigned()
        .notNullable()
        .references('alliance_id')
        .inTable('alliances')
        .onDelete('RESTRICT')
        .comment('Acreedora, aunque la atribución se cierre después')

      table
        .integer('alliance_attribution_id')
        .unsigned()
        .notNullable()
        .references('alliance_attribution_id')
        .inTable('alliance_attributions')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .bigInteger('billing_payment_id')
        .unsigned()
        .notNullable()
        .references('billing_payment_id')
        .inTable('billing_payments')
        .onDelete('RESTRICT')
        .unique()

      table
        .integer('alliance_commission_periods')
        .unsigned()
        .notNullable()
        .comment('Periodos de servicio que este asiento consume del plazo')

      table
        .integer('alliance_commission_base_cents')
        .unsigned()
        .notNullable()
        .comment('Subtotal sin IVA con descuentos × periodos consumidos')

      table.decimal('alliance_commission_percent', 5, 2).notNullable()

      table
        .integer('alliance_commission_amount_cents')
        .unsigned()
        .notNullable()
        .comment('Base × porcentaje, redondeado al centavo (medio sube)')

      table
        .date('alliance_commission_paid_on')
        .notNullable()
        .comment('Día civil de la fecha de pago capturada, hora de México')

      table.timestamp('alliance_commission_created_at').notNullable().defaultTo(this.now())

      table.index(['alliance_id'], 'idx_alliance_commissions_alliance_id')
      table.index(['alliance_attribution_id'], 'idx_alliance_commissions_attribution_id')
      table.index(['business_unit_id'], 'idx_alliance_commissions_business_unit_id')
      table.index(['alliance_commission_paid_on'], 'idx_alliance_commissions_paid_on')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
