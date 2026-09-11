import { test } from '@japa/runner'
import {
  maskIp,
  maskSerial,
} from '#modules/access-point/quarantine/quarantine_claim.constants'

test.group('Enmascarado de la cuarentena', () => {
  test('la serie solo muestra los ultimos cuatro', ({ assert }) => {
    assert.equal(maskSerial('SYZ8252500376'), '*********0376')
    // Quien reclama tiene el aparato delante y lee la etiqueta; la lista no
    // puede ser un catalogo de series validas para quien no lo tiene.
    assert.notInclude(maskSerial('SYZ8252500376'), 'SYZ')
  })

  test('una serie muy corta se oculta entera', ({ assert }) => {
    assert.equal(maskSerial('AB12'), '****')
    assert.equal(maskSerial('A'), '*')
  })

  test('la IP se recorta a /24', ({ assert }) => {
    assert.equal(maskIp('192.168.10.57'), '192.168.10.0/24')
  })

  test('una IPv6 o algo raro no se filtra a medias', ({ assert }) => {
    assert.equal(maskIp('2001:db8::1'), 'oculta')
    assert.equal(maskIp(''), 'oculta')
  })
})
