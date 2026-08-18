import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pagos gobernados: monto no editable y saldo acumulable por periodos
 * (USRH1785962095095).
 *
 * Retrocompatibilidad de los pagos existentes: no se reconstruyen cifras
 * históricas. Las filas anteriores quedan con `periods_covered = 1` (lo que
 * efectivamente hicieron con el avance fijo de un mes), `credit_applied` y
 * `credit_balance_after` en 0, y la foto financiera en 0 como marcador de
 * "no disponible" (USRH1785962095098 distingue ese caso en pantalla).
 *
 * `billing_payment_period_start`/`_end` se relajan a nullable: un pago
 * parcial no cubre periodo alguno y llenarlos con el periodo vigente sería
 * registrar un dato falso.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('billing_payment_period_amount_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_amount_cents')
      table
        .tinyint('billing_payment_periods_covered')
        .unsigned()
        .notNullable()
        .defaultTo(1)
        .after('billing_payment_period_amount_cents')
      table
        .integer('billing_payment_credit_applied_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_periods_covered')
      table
        .integer('billing_payment_credit_balance_after_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_credit_applied_cents')
      table
        .boolean('billing_payment_is_custom_amount')
        .notNullable()
        .defaultTo(false)
        .after('billing_payment_credit_balance_after_cents')

      // ─── Foto financiera del periodo cobrado, en centavos (regla 12) ───────
      table
        .integer('billing_payment_gross_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_is_custom_amount')
      table
        .integer('billing_payment_discount_amount_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_gross_cents')
      table
        .integer('billing_payment_subtotal_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_discount_amount_cents')
      table
        .integer('billing_payment_tax_amount_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_subtotal_cents')
      table
        .integer('billing_payment_total_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_tax_amount_cents')
      table
        .decimal('billing_payment_discount_percent', 5, 2)
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_total_cents')
      table
        .decimal('billing_payment_tax_rate', 5, 4)
        .notNullable()
        .defaultTo(0)
        .after('billing_payment_discount_percent')
    })

    // MySQL: relajar NOT NULL → NULL requiere MODIFY COLUMN (knex .alter()).
    this.schema.alterTable(this.tableName, (table) => {
      table.date('billing_payment_period_start').nullable().alter()
      table.date('billing_payment_period_end').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('billing_payment_period_start').notNullable().alter()
      table.date('billing_payment_period_end').notNullable().alter()
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_payment_period_amount_cents')
      table.dropColumn('billing_payment_periods_covered')
      table.dropColumn('billing_payment_credit_applied_cents')
      table.dropColumn('billing_payment_credit_balance_after_cents')
      table.dropColumn('billing_payment_is_custom_amount')
      table.dropColumn('billing_payment_gross_cents')
      table.dropColumn('billing_payment_discount_amount_cents')
      table.dropColumn('billing_payment_subtotal_cents')
      table.dropColumn('billing_payment_tax_amount_cents')
      table.dropColumn('billing_payment_total_cents')
      table.dropColumn('billing_payment_discount_percent')
      table.dropColumn('billing_payment_tax_rate')
    })
  }
}
