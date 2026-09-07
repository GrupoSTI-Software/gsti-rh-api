import { test } from '@japa/runner'
import {
  PENDING_INCREASE_AMOUNT_COLUMN,
  PENDING_INCREASE_CHANGES_TABLE,
  pendingIncreaseChangeConditionSql,
  pendingIncreaseDebtConditionSql,
} from '../../../app/helpers/billing_pending_increase_change_filter.js'

/**
 * USRH1788052455652 — regla 2: un cliente tiene adeudo por aumento cuando
 * agregó asientos y ese cambio sigue pendiente de pago. El criterio se escribe
 * una sola vez y aquí se fija, porque tres consultas del servicio de cartera lo
 * reproducen y una desincronización subreportaría dinero en silencio.
 */
test.group('billing_pending_increase_change_filter', () => {
  test('exige tipo increase, estado pending_payment y no borrado, con el alias recibido', ({
    assert,
  }) => {
    const sql = pendingIncreaseChangeConditionSql('pic')

    assert.include(sql, "pic.billing_subscription_change_type = 'increase'")
    assert.include(sql, "pic.billing_subscription_change_status = 'pending_payment'")
    assert.include(sql, 'pic.billing_subscription_change_deleted_at IS NULL')
  })

  test('no admite ningún otro estado vivo: scheduled y applied no son adeudo', ({ assert }) => {
    const sql = pendingIncreaseChangeConditionSql('pic')

    assert.notInclude(sql, 'scheduled')
    assert.notInclude(sql, 'applied')
    assert.notInclude(sql, 'not_applicable')
    assert.notInclude(sql, 'decrease')
  })

  test('la variante con importe agrega el mayor a cero sobre la columna de centavos', ({
    assert,
  }) => {
    const base = pendingIncreaseChangeConditionSql('c')
    const conImporte = pendingIncreaseDebtConditionSql('c')

    assert.include(conImporte, base)
    assert.include(conImporte, `c.${PENDING_INCREASE_AMOUNT_COLUMN} > 0`)
  })

  test('un alias que no sea identificador se rechaza en vez de concatenarse', ({ assert }) => {
    assert.throws(() => pendingIncreaseChangeConditionSql('pic; DROP TABLE users'))
    assert.throws(() => pendingIncreaseChangeConditionSql(''))
    assert.throws(() => pendingIncreaseChangeConditionSql('pic pic'))
  })

  test('publica el nombre de la tabla y de la columna del importe', ({ assert }) => {
    assert.equal(PENDING_INCREASE_CHANGES_TABLE, 'billing_subscription_changes')
    assert.equal(
      PENDING_INCREASE_AMOUNT_COLUMN,
      'billing_subscription_change_prorated_amount_cents'
    )
  })
})
