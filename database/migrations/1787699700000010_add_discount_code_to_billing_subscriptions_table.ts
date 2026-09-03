import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Canje y congelado del código de descuento en la contratación
 * (USRH1787714804401 §10).
 *
 * Todo lo que llega aquí es un snapshot write-once: se congela junto con
 * los `contracted_*` en `createSubscriptionWithin` y ningún cambio
 * posterior del catálogo (`discount_codes`) lo altera. `RESTRICT` en la FK
 * porque un código canjeado es evidencia del acuerdo de una cuenta viva —
 * `SET NULL` dejaría una suscripción con texto y condiciones congeladas
 * pero sin referencia al origen.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('billing_subscription_discount_code_id')
        .unsigned()
        .nullable()
        .after('billing_subscription_credit_balance_cents')

      table
        .foreign('billing_subscription_discount_code_id', 'fk_billing_sub_discount_code_id')
        .references('discount_code_id')
        .inTable('discount_codes')
        .onDelete('RESTRICT')

      table
        .string('billing_subscription_discount_code_text', 40)
        .nullable()
        .comment('Texto del código congelado en MAYÚSCULAS; la suscripción se lee sin depender del catálogo')
        .after('billing_subscription_discount_code_id')

      table
        .enum('billing_subscription_discount_code_kind', ['percent', 'fixed_amount', 'unit_price'])
        .nullable()
        .comment('Tipo de beneficio congelado al canjear')
        .after('billing_subscription_discount_code_text')

      table
        .decimal('billing_subscription_discount_code_value', 12, 2)
        .nullable()
        .comment('Valor del beneficio congelado al canjear')
        .after('billing_subscription_discount_code_kind')

      table
        .integer('billing_subscription_discount_code_benefit_periods')
        .unsigned()
        .nullable()
        .comment('Duración del beneficio en periodos, congelada; NULL con código presente = indefinido')
        .after('billing_subscription_discount_code_value')

      table
        .integer('billing_subscription_discount_code_benefit_periods_used')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .comment('Periodos de beneficio consumidos; nace en 0, lo mueve el cobro del periodo (eslabón 8)')
        .after('billing_subscription_discount_code_benefit_periods')

      table
        .decimal('billing_subscription_code_discount_amount', 12, 2)
        .notNullable()
        .defaultTo(0)
        .comment('Pesos que el código descuenta en el periodo vigente')
        .after('billing_subscription_discount_code_benefit_periods_used')

      table
        .decimal('billing_subscription_undiscounted_unit_amount', 10, 2)
        .nullable()
        .comment('Precio por empleado de lista, antes de que un código unit_price lo sustituya')
        .after('billing_subscription_code_discount_amount')

      table
        .decimal('billing_subscription_undiscounted_subtotal', 12, 2)
        .nullable()
        .comment('Subtotal sin el código: con el descuento por volumen ya aplicado')
        .after('billing_subscription_undiscounted_unit_amount')

      table
        .decimal('billing_subscription_undiscounted_tax_amount', 12, 2)
        .nullable()
        .comment('Impuesto sin el código, sobre el subtotal sin código')
        .after('billing_subscription_undiscounted_subtotal')

      table
        .decimal('billing_subscription_undiscounted_total', 12, 2)
        .nullable()
        .comment('Total sin el código, que el cliente habría pagado sin la promoción')
        .after('billing_subscription_undiscounted_tax_amount')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.index(
        ['billing_subscription_discount_code_id'],
        'idx_billing_subscription_discount_code_id'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['billing_subscription_discount_code_id'],
        'fk_billing_sub_discount_code_id'
      )
      table.dropIndex(['billing_subscription_discount_code_id'], 'idx_billing_subscription_discount_code_id')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_discount_code_id')
      table.dropColumn('billing_subscription_discount_code_text')
      table.dropColumn('billing_subscription_discount_code_kind')
      table.dropColumn('billing_subscription_discount_code_value')
      table.dropColumn('billing_subscription_discount_code_benefit_periods')
      table.dropColumn('billing_subscription_discount_code_benefit_periods_used')
      table.dropColumn('billing_subscription_code_discount_amount')
      table.dropColumn('billing_subscription_undiscounted_unit_amount')
      table.dropColumn('billing_subscription_undiscounted_subtotal')
      table.dropColumn('billing_subscription_undiscounted_tax_amount')
      table.dropColumn('billing_subscription_undiscounted_total')
    })
  }
}
