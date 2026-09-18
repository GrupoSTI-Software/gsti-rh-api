import { test } from '@japa/runner'
import { roundCommissionAmountCents } from '#services/alliance_commission_service'

/**
 * Redondeo de comisiones de alianza (ESB-07-09-09-09):
 * base × porcentaje, al centavo, medio sube.
 */
test.group('roundCommissionAmountCents', () => {
  test('1.15 % de $1,010.00 queda en $11.62 (medio centavo sube)', ({ assert }) => {
    assert.equal(roundCommissionAmountCents(101_000, 1.15), 1_162)
  })

  test('reproduz las cifras del ejemplo ilustrativo', ({ assert }) => {
    assert.equal(roundCommissionAmountCents(800_000, 10), 80_000)
    assert.equal(roundCommissionAmountCents(2_400_000, 10), 240_000)
    assert.equal(roundCommissionAmountCents(960_000, 10), 96_000)
    assert.equal(roundCommissionAmountCents(1_600_000, 10), 160_000)
  })

  test('un porcentaje de cero produce cero', ({ assert }) => {
    assert.equal(roundCommissionAmountCents(800_000, 0), 0)
  })
})
