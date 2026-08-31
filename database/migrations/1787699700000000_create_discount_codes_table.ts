import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'discount_codes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('discount_code_id').unsigned().primary()

      table
        .string('discount_code_code', 40)
        .notNullable()
        .comment('Texto entregado al cliente, siempre en MAYÚSCULAS; irrepetible de por vida')

      table
        .string('discount_code_name', 160)
        .notNullable()
        .comment('Nombre o descripción de la campaña/cuenta para el operador')

      table
        .enum('discount_code_kind', ['percent', 'fixed_amount', 'unit_price'])
        .notNullable()
        .comment('Tipo de beneficio: porcentaje, monto fijo o precio fijo por empleado')

      table
        .decimal('discount_code_value', 12, 2)
        .notNullable()
        .comment('Valor del beneficio; semántica según discount_code_kind')

      table
        .date('discount_code_valid_from')
        .nullable()
        .comment('Inicio de vigencia; NULL = sin límite inferior')

      table
        .date('discount_code_valid_to')
        .nullable()
        .comment('Fin de vigencia; NULL = no caduca')

      table
        .integer('discount_code_max_redemptions')
        .unsigned()
        .nullable()
        .comment('Tope de canjes entre todos los clientes; NULL = sin tope')

      table
        .integer('discount_code_redeemed_count')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .comment(
          'Contador denormalizado de canjes; lo mueve el canje (USRH1787714804401), nunca la captura manual'
        )

      table
        .integer('discount_code_benefit_periods')
        .unsigned()
        .nullable()
        .comment('Duración del beneficio en periodos de cobro; NULL = indefinido')

      table
        .tinyint('discount_code_active')
        .unsigned()
        .notNullable()
        .defaultTo(1)
        .comment('Activo/apagado; reversible, no libera el texto')

      table.timestamps(true, true)

      table
        .timestamp('discount_code_deleted_at')
        .nullable()
        .comment('Soft delete de limpieza de datos; sin endpoint en esta HU, no libera el texto')

      table.unique(['discount_code_code'], 'uq_discount_code_code')
      table.index(['discount_code_active', 'discount_code_kind'], 'idx_discount_code_active_kind')
      table.index(['discount_code_valid_to'], 'idx_discount_code_valid_to')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
