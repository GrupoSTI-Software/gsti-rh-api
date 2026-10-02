import { test } from '@japa/runner'
import {
  resolveCompositeIncreaseCents,
  toPeriodAmountCents,
} from '../../../app/helpers/billing_period_amount.js'

/**
 * USRH1790718243180 — CA-2 y CA-3: redondeo idéntico al cuerpo previo de
 * billing_payment_service y composición del aumento pendiente.
 */
test.group('billing_period_amount', () => {
  test('toPeriodAmountCents: redondeo y valores válidos (CA-2)', ({ assert }) => {
    assert.equal(toPeriodAmountCents('1160.00'), 116000)
    assert.equal(toPeriodAmountCents('19.99'), 1999)
    assert.equal(toPeriodAmountCents('1.005'), 100)
    assert.equal(toPeriodAmountCents('0.01'), 1)
    assert.equal(toPeriodAmountCents('1e3'), 100000)
  })

  test('toPeriodAmountCents: no determinable → null (CA-2)', ({ assert }) => {
    assert.isNull(toPeriodAmountCents('0.00'))
    assert.isNull(toPeriodAmountCents('-5.00'))
    assert.isNull(toPeriodAmountCents('abc'))
    assert.isNull(toPeriodAmountCents(''))
    assert.isNull(toPeriodAmountCents(null))
    assert.isNull(toPeriodAmountCents(undefined))
    assert.isNull(toPeriodAmountCents(Number.NaN))
    assert.isNull(toPeriodAmountCents(Number.POSITIVE_INFINITY))
  })

  test('resolveCompositeIncreaseCents: compuesto del aumento (CA-3)', ({ assert }) => {
    assert.deepEqual(
      resolveCompositeIncreaseCents({ proratedAmountCents: 4523, changeTotal: '2320.00' }),
      { debtCents: 4523, periodCents: 232000, debtPlusPeriodCents: 236523 }
    )
    assert.deepEqual(
      resolveCompositeIncreaseCents({ proratedAmountCents: 0, changeTotal: '2320.00' }),
      { debtCents: 0, periodCents: 232000, debtPlusPeriodCents: 232000 }
    )
    assert.isNull(
      resolveCompositeIncreaseCents({ proratedAmountCents: 4523, changeTotal: '0.00' })
    )
  })
})
