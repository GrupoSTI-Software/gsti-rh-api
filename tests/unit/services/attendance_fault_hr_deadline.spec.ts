import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { isPastFaultDeadline } from '#services/attendance_fault_hr_notification_service'

/**
 * Plazo de la notificación de faltas a RH: inicio del turno en la zona del
 * sitio más la tolerancia de falta. Antes se calculaba con `-06:00` fijo, así
 * que en Tijuana avisaba una o dos horas antes de tiempo.
 */

const at = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' })

test.group('Notificación de faltas a RH — plazo de falta', () => {
  test('CDMX: turno de 08:00 con 31 minutos vence a las 08:31 (14:31Z)', ({ assert }) => {
    const zone = 'America/Mexico_City'
    assert.isFalse(
      isPastFaultDeadline('2026-07-22', '08:00:00', zone, 31, at('2026-07-22T14:30:00Z'))
    )
    assert.isTrue(
      isPastFaultDeadline('2026-07-22', '08:00:00', zone, 31, at('2026-07-22T14:32:00Z'))
    )
  })

  test('Tijuana en verano: el mismo turno vence a las 15:31Z, no a las 14:31Z', ({ assert }) => {
    const zone = 'America/Tijuana'
    assert.isFalse(
      isPastFaultDeadline('2026-07-22', '08:00:00', zone, 31, at('2026-07-22T14:32:00Z'))
    )
    assert.isTrue(
      isPastFaultDeadline('2026-07-22', '08:00:00', zone, 31, at('2026-07-22T15:32:00Z'))
    )
  })
})
