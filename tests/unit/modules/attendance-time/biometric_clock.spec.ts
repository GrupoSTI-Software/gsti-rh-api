import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  biometricStoredToUtc,
  biometricSummerWindow,
  biometricUtcOffsetHours,
  biometricWallTime,
  parseBiometricStored,
} from '#modules/attendance-time/biometric_clock'

test.group('attendance-time — reloj del checador BioTime', () => {
  test('la ventana de verano del checador va del primer domingo de abril al último de octubre', ({
    assert,
  }) => {
    assert.deepEqual(biometricSummerWindow(2026), { start: '2026-04-05', end: '2026-10-25' })
    assert.equal(biometricUtcOffsetHours('2026-04-04'), 6)
    assert.equal(biometricUtcOffsetHours('2026-04-05'), 5)
    assert.equal(biometricUtcOffsetHours('2026-10-25'), 5)
    assert.equal(biometricUtcOffsetHours('2026-10-26'), 6)
  })

  test('recupera la hora de pared: 08:00 marcadas en verano se guardaron como 13:00', ({
    assert,
  }) => {
    const wall = biometricWallTime(parseBiometricStored('2026-07-22T13:00:00.000Z'))
    assert.equal(wall.toFormat('yyyy-LL-dd HH:mm'), '2026-07-22 08:00')
    const winter = biometricWallTime(parseBiometricStored('2026-01-22T14:00:00.000Z'))
    assert.equal(winter.toFormat('yyyy-LL-dd HH:mm'), '2026-01-22 08:00')
  })

  test('convierte a UTC real con la zona del sitio: la misma pared vale distinto en Tijuana', ({
    assert,
  }) => {
    const stored = parseBiometricStored('2026-07-22T13:00:00.000Z')
    assert.equal(
      biometricStoredToUtc(stored, 'America/Mexico_City').toISO(),
      '2026-07-22T14:00:00.000Z'
    )
    assert.equal(biometricStoredToUtc(stored, 'America/Tijuana').toISO(), '2026-07-22T15:00:00.000Z')
  })

  test('en invierno el valor guardado ya coincide con UTC real de Ciudad de México', ({ assert }) => {
    const stored = parseBiometricStored('2026-01-22T14:00:00.000Z')
    assert.equal(
      biometricStoredToUtc(stored, 'America/Mexico_City').toISO(),
      '2026-01-22T14:00:00.000Z'
    )
  })

  test('cerca de la medianoche el offset se decide con el día de la pared, no del valor guardado', ({
    assert,
  }) => {
    // Pared 2026-04-04 23:30 (todavía invierno del checador) guardada como +6 = 05:30 del día 5.
    const wall = biometricWallTime(parseBiometricStored('2026-04-05T05:30:00.000Z'))
    assert.equal(wall.toFormat('yyyy-LL-dd HH:mm'), '2026-04-04 23:30')
  })

  test('lee el valor naive de la base o del puente sin moverle los componentes', ({ assert }) => {
    assert.equal(
      parseBiometricStored('2026-07-22 13:00:00').toUTC().toFormat('yyyy-LL-dd HH:mm'),
      '2026-07-22 13:00'
    )
    assert.equal(
      parseBiometricStored(new Date('2026-07-22T13:00:00.000Z')).toUTC().toFormat('HH:mm'),
      '13:00'
    )
    assert.equal(
      parseBiometricStored(DateTime.fromISO('2026-07-22T13:00:00.000Z')).toUTC().toFormat('HH:mm'),
      '13:00'
    )
  })
})
