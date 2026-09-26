import { test } from '@japa/runner'
import {
  admsAck,
  countNonEmptyLines,
  isValidDeviceSerial,
  ADMS_STAMP_TABLES,
} from '#modules/adms/adms.constants'

/**
 * Reglas de la seccion 2 y 4.2 del spec: formato del acuse, conteo de lineas
 * (lineas no vacias, como la sonda) y patron de la serie.
 */
test.group('ADMS constants', () => {
  test('acuse literal con espacio y conteo de lineas no vacias', ({ assert }) => {
    assert.equal(admsAck(3), 'OK: 3')
    assert.equal(countNonEmptyLines('9999\t2026-08-12 08:53:23\t0\t1\t0\t0\t0\t255\t0\t0\t\n'), 1)
    assert.equal(countNonEmptyLines('a\n\nb\n   \nc'), 3)
    assert.equal(countNonEmptyLines(''), 0)
  })

  test('serie valida: alfanumerica con guion, 6 a 32 caracteres', ({ assert }) => {
    assert.isTrue(isValidDeviceSerial('SYZ8252500376'))
    assert.isTrue(isValidDeviceSerial('NYU7253300829'))
    assert.isTrue(isValidDeviceSerial('TEST-ADMS-1757000000000'))
    assert.isFalse(isValidDeviceSerial(''))
    assert.isFalse(isValidDeviceSerial('ABC12'))
    assert.isFalse(isValidDeviceSerial('A'.repeat(33)))
    assert.isFalse(isValidDeviceSerial('SYZ 825'))
    assert.isFalse(isValidDeviceSerial('SYZ;DROP'))
    assert.isFalse(isValidDeviceSerial(null))
    assert.isFalse(isValidDeviceSerial(42))
  })

  test('tablas con stamp en el saludo', ({ assert }) => {
    assert.deepEqual(
      [...ADMS_STAMP_TABLES],
      ['ATTLOG', 'OPERLOG', 'USERINFO', 'ATTPHOTO', 'BIODATA']
    )
  })
})
