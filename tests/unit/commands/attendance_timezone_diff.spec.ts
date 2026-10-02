import { test } from '@japa/runner'
import { diffAttendanceDay } from '#modules/attendance-time/reconcile/attendance_timezone_diff'

const tolerances = { delayMinutes: 10, faultMinutes: 30 }

test.group('reconcile-timezone — comparación de buckets', () => {
  test('una checada en UTC real en Ciudad de México no cambia de bucket', ({ assert }) => {
    // Entrada 07:55 y salida 18:05 locales para un turno 08:00 + 10 h: iguales en ambas reglas.
    assert.isEmpty(
      diffAttendanceDay(
        {
          day: '2026-09-01',
          shiftTimeStart: '08:00:00',
          shiftActiveHours: 10,
          checkInUtc: '2026-09-01T13:55:00.000Z',
          checkOutUtc: '2026-09-02T00:05:00.000Z',
        },
        'America/Mexico_City',
        tolerances
      )
    )
  })

  test('en Ciudad Juárez en invierno la misma marca cambia la entrada de bucket', ({ assert }) => {
    // 15:05Z: en -06:00 fijo son las 09:05 (falta); en Juárez invierno (-7) son las 08:05 (tolerancia).
    const differences = diffAttendanceDay(
      {
        day: '2026-01-15',
        shiftTimeStart: '08:00:00',
        shiftActiveHours: 8,
        checkInUtc: '2026-01-15T15:05:00.000Z',
        checkOutUtc: null,
      },
      'America/Ciudad_Juarez',
      tolerances
    )
    assert.deepEqual(differences, [
      {
        day: '2026-01-15',
        kind: 'check_in',
        punchUtc: '2026-01-15T15:05:00.000Z',
        previous: 'fault',
        current: 'tolerance',
      },
    ])
  })

  test('un turno sin hora válida no produce comparación', ({ assert }) => {
    assert.isEmpty(
      diffAttendanceDay(
        { day: '2026-01-15', shiftTimeStart: '', shiftActiveHours: 8, checkInUtc: null, checkOutUtc: null },
        'America/Mexico_City',
        tolerances
      )
    )
  })
})
