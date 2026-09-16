import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Congelado del descuento del código en el registro del cambio de cantidad
 * contratada (USRH1787714804405 §10).
 *
 * El registro del cambio ya congela `_unit_amount/_discount_percent/_tax_rate/
 * _subtotal/_tax_amount/_total/_prorated_amount_cents`; esta migración le suma
 * el lado del código: cuánto descuenta en pesos, cuánto costaría sin él (con
 * el precio de lista por empleado) y la evidencia del código vigente al
 * congelar (texto y tipo), para poder detectar en la aplicación que el
 * trato se movió entre que se prometió y que se aplicó (guarda fail-closed
 * de código desfasado).
 *
 * No se copian `_benefit_periods` ni `_benefit_periods_used`: un cambio de
 * cupo no los lee ni los escribe (regla 4). Sin FK a `discount_codes`: es
 * evidencia congelada, no una referencia viva.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_subscription_changes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .decimal('billing_subscription_change_code_discount_amount', 12, 2)
        .notNullable()
        .defaultTo(0)
        .comment('Pesos que el código descuenta en el trato nuevo; se transcribe al aplicar')
        .after('billing_subscription_change_prorated_amount_cents')

      table
        .decimal('billing_subscription_change_undiscounted_unit_amount', 10, 2)
        .nullable()
        .comment('Precio de lista por empleado del trato nuevo; espeja el de la suscripción')
        .after('billing_subscription_change_code_discount_amount')

      table
        .decimal('billing_subscription_change_undiscounted_subtotal', 12, 2)
        .nullable()
        .comment('Subtotal del trato nuevo sin el código')
        .after('billing_subscription_change_undiscounted_unit_amount')

      table
        .decimal('billing_subscription_change_undiscounted_tax_amount', 12, 2)
        .nullable()
        .comment('Impuesto del trato nuevo sin el código')
        .after('billing_subscription_change_undiscounted_subtotal')

      table
        .decimal('billing_subscription_change_undiscounted_total', 12, 2)
        .nullable()
        .comment('Total del trato nuevo sin el código')
        .after('billing_subscription_change_undiscounted_tax_amount')

      table
        .string('billing_subscription_change_discount_code_text', 40)
        .nullable()
        .comment('Texto del código vigente en la suscripción al congelar este cambio')
        .after('billing_subscription_change_undiscounted_total')

      table
        .enum('billing_subscription_change_discount_code_kind', [
          'percent',
          'fixed_amount',
          'unit_price',
        ])
        .nullable()
        .comment('Tipo del código vigente al congelar este cambio')
        .after('billing_subscription_change_discount_code_text')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_change_code_discount_amount')
      table.dropColumn('billing_subscription_change_undiscounted_unit_amount')
      table.dropColumn('billing_subscription_change_undiscounted_subtotal')
      table.dropColumn('billing_subscription_change_undiscounted_tax_amount')
      table.dropColumn('billing_subscription_change_undiscounted_total')
      table.dropColumn('billing_subscription_change_discount_code_text')
      table.dropColumn('billing_subscription_change_discount_code_kind')
    })
  }
}
