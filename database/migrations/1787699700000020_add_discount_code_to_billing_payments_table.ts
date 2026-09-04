import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca del código de descuento en la fila del pago (USRH1787714804403 §5,
 * Anexo A). `billing_payments` es append-only: agregar columnas es válido,
 * mutar filas existentes no. Las filas históricas quedan en NULL/0, que es
 * exactamente lo que ocurrió en ellas (no llevaron código).
 *
 * Sin FK a `discount_codes`: el código pudo desactivarse o borrarse lógicamente
 * después del pago y esta fila no depende de esa tabla para seguir siendo
 * legible (`billing_subscriptions` ya tiene la FK que sí necesita integridad
 * referencial). Sin índice: no hay consulta de este eslabón que filtre por
 * estas columnas; se agrega si una futura HU de reportes lo justifica.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('billing_payment_discount_code_text', 40)
        .nullable()
        .comment('Texto del código vigente en el periodo cobrado; NULL si el periodo no llevó código')
        .after('billing_payment_tax_rate')

      table
        .enum('billing_payment_discount_code_kind', ['percent', 'fixed_amount', 'unit_price'])
        .nullable()
        .comment('Tipo del código en el periodo cobrado; NULL si el periodo no llevó código')
        .after('billing_payment_discount_code_text')

      table
        .integer('billing_payment_code_discount_amount_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .comment('Centavos que el código descontó en el periodo cobrado; 0 si no llevó código')
        .after('billing_payment_discount_code_kind')

      table
        .smallint('billing_payment_discount_code_benefit_periods_used_after')
        .unsigned()
        .nullable()
        .comment(
          'Periodos de beneficio consumidos tras este pago; NULL cuando el periodo no se cobró con código, incluido el caso de beneficio ya agotado'
        )
        .after('billing_payment_code_discount_amount_cents')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_payment_discount_code_text')
      table.dropColumn('billing_payment_discount_code_kind')
      table.dropColumn('billing_payment_code_discount_amount_cents')
      table.dropColumn('billing_payment_discount_code_benefit_periods_used_after')
    })
  }
}
