import { test } from '@japa/runner'
import {
  resolveAttributionAccrualProgress,
  resolveRemainingTermPeriods,
} from '#helpers/alliance_commission'

/**
 * Avance del plazo de una atribución (USRH1787719056818).
 * `resolveAttributionAccrualProgress` reutiliza `resolveRemainingTermPeriods`.
 */
test.group('resolveRemainingTermPeriods', () => {
  test('plazo indeterminado informa null, nunca 0', ({ assert }) => {
    assert.isNull(resolveRemainingTermPeriods(null, 0))
    assert.isNull(resolveRemainingTermPeriods(null, 30))
  })

  test('plazo determinado resta lo devengado y no baja de cero', ({ assert }) => {
    assert.equal(resolveRemainingTermPeriods(12, 0), 12)
    assert.equal(resolveRemainingTermPeriods(12, 3), 9)
    assert.equal(resolveRemainingTermPeriods(12, 12), 0)
    assert.equal(resolveRemainingTermPeriods(12, 15), 0)
  })
})

test.group('resolveAttributionAccrualProgress', () => {
  test('CA-1: sin comisiones, plazo determinado, sigue generando', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(12, false, 0), {
      remainingPeriods: 12,
      isAccruing: true,
      notAccruingReason: null,
    })
  })

  test('CA-2: en curso, restantes = plazo menos devengados', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(12, false, 3), {
      remainingPeriods: 9,
      isAccruing: true,
      notAccruingReason: null,
    })
  })

  test('CA-3: plazo agotado y no cerrada', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(12, false, 12), {
      remainingPeriods: 0,
      isAccruing: false,
      notAccruingReason: 'term_exhausted',
    })
  })

  test('CA-4: cerrada gana sobre plazo agotado', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(12, true, 12), {
      remainingPeriods: 0,
      isAccruing: false,
      notAccruingReason: 'closed',
    })
  })

  test('CA-5: cerrada sin agotar informa restantes y motivo closed', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(12, true, 5), {
      remainingPeriods: 7,
      isAccruing: false,
      notAccruingReason: 'closed',
    })
  })

  test('CA-6: indeterminado nunca agota', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(null, false, 30), {
      remainingPeriods: null,
      isAccruing: true,
      notAccruingReason: null,
    })
  })

  test('ampliar la lectura de una agotada: 12 de 14 vuelve a generar', ({ assert }) => {
    assert.deepEqual(resolveAttributionAccrualProgress(14, false, 12), {
      remainingPeriods: 2,
      isAccruing: true,
      notAccruingReason: null,
    })
  })
})
