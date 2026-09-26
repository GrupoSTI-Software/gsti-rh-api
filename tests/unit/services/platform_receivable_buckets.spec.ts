import { test } from '@japa/runner'
import {
  RECEIVABLE_BUCKET_UPPER_BOUNDS,
  resolveReceivableBucket,
} from '../../../app/services/platform_receivable_service.js'

/**
 * USRH1788052455651 — regla 5: la antigüedad se agrupa en tres tramos y cada
 * cliente cae en uno solo. Los bordes se fijan aquí porque el resumen los
 * reproduce en SQL: si alguien mueve una cota, este test lo detiene.
 */
test.group('resolveReceivableBucket', () => {
  test('0 días cae en hasta30: el reloj pudo marcar past_due hoy mismo', ({ assert }) => {
    assert.equal(resolveReceivableBucket(0), 'hasta30')
  })

  test('30 días es el último día de hasta30 y 31 ya es de31a60', ({ assert }) => {
    assert.equal(resolveReceivableBucket(30), 'hasta30')
    assert.equal(resolveReceivableBucket(31), 'de31a60')
  })

  test('60 días es el último día de de31a60 y 61 ya es mas60', ({ assert }) => {
    assert.equal(resolveReceivableBucket(60), 'de31a60')
    assert.equal(resolveReceivableBucket(61), 'mas60')
  })

  test('los tres valores del criterio caen en los tres tramos (CA-2)', ({ assert }) => {
    assert.equal(resolveReceivableBucket(12), 'hasta30')
    assert.equal(resolveReceivableBucket(45), 'de31a60')
    assert.equal(resolveReceivableBucket(91), 'mas60')
  })

  test('las cotas se publican para que el SQL del resumen use las mismas', ({ assert }) => {
    assert.equal(RECEIVABLE_BUCKET_UPPER_BOUNDS.hasta30, 30)
    assert.equal(RECEIVABLE_BUCKET_UPPER_BOUNDS.de31a60, 60)
  })
})
