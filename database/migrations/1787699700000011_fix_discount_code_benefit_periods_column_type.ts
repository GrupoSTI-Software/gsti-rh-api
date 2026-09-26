import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajuste de tipo (USRH1787714804401 §10): la migración anterior
 * (`1787699700000010`) creó `billing_subscription_discount_code_benefit_periods`
 * como `INTEGER UNSIGNED`; el spec la fija como `SMALLINT UNSIGNED` — un
 * beneficio no dura miles de periodos, y el resto de columnas "conteo corto"
 * del dominio (p. ej. `billing_subscription_contracted_trial_days`) usa el
 * mismo criterio de tamaño mínimo suficiente. Cambio de tipo puro: no altera
 * nulabilidad, default ni datos existentes (todo NULL o pequeño hasta hoy).
 */
export default class extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
        MODIFY COLUMN billing_subscription_discount_code_benefit_periods
        SMALLINT UNSIGNED NULL
        COMMENT 'Duración del beneficio en periodos, congelada; NULL con código presente = indefinido'`
    )
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
        MODIFY COLUMN billing_subscription_discount_code_benefit_periods_used
        SMALLINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Periodos de beneficio consumidos; nace en 0, lo mueve el cobro del periodo (eslabón 8)'`
    )
  }

  async down() {
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
        MODIFY COLUMN billing_subscription_discount_code_benefit_periods
        INTEGER UNSIGNED NULL
        COMMENT 'Duración del beneficio en periodos, congelada; NULL con código presente = indefinido'`
    )
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
        MODIFY COLUMN billing_subscription_discount_code_benefit_periods_used
        INTEGER UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Periodos de beneficio consumidos; nace en 0, lo mueve el cobro del periodo (eslabón 8)'`
    )
  }
}
