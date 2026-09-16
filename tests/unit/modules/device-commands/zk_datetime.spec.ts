import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { fromZkDateTime, toZkDateTime } from '#modules/device-commands/wire/zk_datetime'

/**
 * La bateria midio que la formula equivocada tambien acusa `Return=0`, mientras
 * mueve el reloj 180 dias atras. Estas pruebas son la unica defensa contra
 * volver a escribirla mal: van y vuelven para demostrar que el entero
 * representa la fecha que creemos.
 */
test.group('Fecha empaquetada de ZKTeco', () => {
  test('la formula validada: no es epoch, cuenta meses de 31 dias', ({ assert }) => {
    const local = DateTime.fromObject(
      { year: 2026, month: 8, day: 13, hour: 11, minute: 19, second: 12 },
      { zone: 'America/Mexico_City' }
    )
    const expected =
      ((2026 - 2000) * 12 * 31 + (8 - 1) * 31 + (13 - 1)) * 86400 + 11 * 3600 + 19 * 60 + 12
    assert.equal(toZkDateTime(local), expected)
  })

  test('ida y vuelta en los bordes del calendario', ({ assert }) => {
    const casos = [
      { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      { year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59 },
      { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      { year: 2026, month: 2, day: 28, hour: 12, minute: 30, second: 45 },
      { year: 2026, month: 8, day: 31, hour: 6, minute: 0, second: 1 },
    ]
    for (const caso of casos) {
      const local = DateTime.fromObject(caso, { zone: 'America/Mexico_City' })
      assert.deepEqual(fromZkDateTime(toZkDateTime(local)), caso)
    }
  })

  test('usa la hora local que recibe y no la convierte a UTC por su cuenta', ({ assert }) => {
    const instante = DateTime.fromISO('2026-08-13T17:19:12Z', { zone: 'utc' })
    const enCiudadDeMexico = toZkDateTime(instante.setZone('America/Mexico_City'))
    const enTijuana = toZkDateTime(instante.setZone('America/Tijuana'))
    // Mismo instante, dos relojes de pared distintos: dos enteros distintos.
    assert.notEqual(enCiudadDeMexico, enTijuana)
    assert.equal(enCiudadDeMexico - enTijuana, 3600)
  })

  test('el dia 31 de un mes de 30 dias sigue siendo representable', ({ assert }) => {
    // La formula reserva 31 ranuras por mes: el hueco existe aunque el mes no.
    const local = DateTime.fromObject(
      { year: 2026, month: 4, day: 30, hour: 8, minute: 0, second: 0 },
      { zone: 'America/Mexico_City' }
    )
    const value = toZkDateTime(local)
    assert.equal(fromZkDateTime(value).day, 30)
    assert.equal(fromZkDateTime(value).month, 4)
  })

  test('una fecha anterior al origen del formato se rechaza en vez de emitir un negativo', ({
    assert,
  }) => {
    const local = DateTime.fromObject(
      { year: 1999, month: 12, day: 31, hour: 23, minute: 59, second: 59 },
      { zone: 'America/Mexico_City' }
    )
    assert.throws(() => toZkDateTime(local))
  })

  test('una fecha invalida de Luxon no produce un entero silencioso', ({ assert }) => {
    assert.throws(() => toZkDateTime(DateTime.invalid('sin zona')))
  })
})
