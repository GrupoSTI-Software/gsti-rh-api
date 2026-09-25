import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  dayKeyOf,
  isValidTimeZone,
  resolveSiteTimeZone,
  shiftEndInstant,
  shiftStartInstant,
  utcOffsetHours,
  wallTime,
} from '#modules/attendance-time/attendance_clock'

test.group('attendance-time — reloj del sitio', () => {
  test('reconoce zonas IANA y rechaza cadenas vacías o inventadas', ({ assert }) => {
    assert.isTrue(isValidTimeZone('America/Ciudad_Juarez'))
    assert.isTrue(isValidTimeZone('America/Mexico_City'))
    assert.isFalse(isValidTimeZone('America/Noexiste'))
    assert.isFalse(isValidTimeZone('   '))
    assert.isFalse(isValidTimeZone(null))
  })

  test('la cadena toma el primer candidato válido y marca el salto sobre uno inválido', ({
    assert,
  }) => {
    assert.deepEqual(
      resolveSiteTimeZone(
        [
          { zone: null, source: 'branch_office' },
          { zone: 'America/Tijuana', source: 'business_unit' },
        ],
        'America/Mexico_City'
      ),
      { zone: 'America/Tijuana', source: 'business_unit', fellBack: false }
    )
    assert.deepEqual(
      resolveSiteTimeZone(
        [
          { zone: 'America/Noexiste', source: 'branch_office' },
          { zone: 'America/Tijuana', source: 'business_unit' },
        ],
        'America/Mexico_City'
      ),
      { zone: 'America/Tijuana', source: 'business_unit', fellBack: true }
    )
    assert.deepEqual(resolveSiteTimeZone([], 'America/Mexico_City'), {
      zone: 'America/Mexico_City',
      source: 'system',
      fellBack: false,
    })
  })

  test('el turno de las 08:00 en Ciudad de México inicia a las 14:00Z todo el año', ({ assert }) => {
    assert.equal(
      shiftStartInstant('2026-07-15', '08:00:00', 'America/Mexico_City').toISO(),
      '2026-07-15T14:00:00.000Z'
    )
    assert.equal(
      shiftStartInstant('2026-01-15', '08:00', 'America/Mexico_City').toISO(),
      '2026-01-15T14:00:00.000Z'
    )
  })

  test('Ciudad Juárez sí cambia de horario: 08:00 es 14:00Z en verano y 15:00Z en invierno', ({
    assert,
  }) => {
    assert.equal(
      shiftStartInstant('2026-07-15', '08:00:00', 'America/Ciudad_Juarez').toISO(),
      '2026-07-15T14:00:00.000Z'
    )
    assert.equal(
      shiftStartInstant('2026-01-15', '08:00:00', 'America/Ciudad_Juarez').toISO(),
      '2026-01-15T15:00:00.000Z'
    )
    assert.equal(utcOffsetHours('America/Ciudad_Juarez', '2026-07-15'), 6)
    assert.equal(utcOffsetHours('America/Ciudad_Juarez', '2026-01-15'), 7)
    assert.equal(utcOffsetHours('America/Mexico_City', '2026-07-15'), 6)
  })

  test('el fin del turno suma las horas activas como duración', ({ assert }) => {
    assert.equal(
      shiftEndInstant('2026-07-15', '22:00:00', 10, 'America/Mexico_City').toISO(),
      '2026-07-16T14:00:00.000Z'
    )
    assert.equal(
      shiftEndInstant('2026-07-15', '08:00:00', 8.5, 'America/Mexico_City').toISO(),
      '2026-07-15T22:30:00.000Z'
    )
  })

  test('una hora de turno sin forma produce un instante inválido en lugar de una falta', ({
    assert,
  }) => {
    assert.isFalse(shiftStartInstant('2026-07-15', '', 'America/Mexico_City').isValid)
    assert.isFalse(shiftStartInstant('2026-07-15', 'ocho', 'America/Mexico_City').isValid)
  })

  test('la hora de pared y el día civil salen de la zona del sitio, no de la del servidor', ({
    assert,
  }) => {
    const punch = '2026-09-01T13:55:00.000Z'
    assert.equal(wallTime(punch, 'America/Mexico_City').toFormat('HH:mm'), '07:55')
    assert.equal(wallTime(punch, 'America/Tijuana').toFormat('HH:mm'), '06:55')
    assert.equal(dayKeyOf('2026-09-02T03:30:00.000Z', 'America/Mexico_City'), '2026-09-01')
    assert.equal(dayKeyOf(new Date('2026-09-02T03:30:00.000Z'), 'America/Mexico_City'), '2026-09-01')
    assert.equal(
      dayKeyOf(DateTime.fromISO('2026-09-02T03:30:00.000Z'), 'America/Mexico_City'),
      '2026-09-01'
    )
  })

  test('una cadena sin zona se toma como UTC, que es lo que guarda la columna', ({ assert }) => {
    assert.equal(wallTime('2026-09-01 13:55:00', 'America/Mexico_City').toFormat('HH:mm'), '07:55')
    assert.equal(wallTime('2026-09-01T13:55:00', 'America/Mexico_City').toFormat('HH:mm'), '07:55')
  })
})
