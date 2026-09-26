import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { assertRegistryRangeIsCoherent } from '#services/traumatic_event_registry_report_service'
import { TraumaticEventReportError } from '#exceptions/traumatic_event_report_error'
import { ETR_ERROR_CODES } from '#constants/traumatic_event_report_error_codes'

/**
 * Tests unitarios de la validación de rango de fechas del registro auditable
 * NOM-035 §5.8.c (sin BD).
 *
 * Cubre el criterio de aceptación CA3: rango invertido → 400 ETR.VAL.RANGE.001.
 * También verifica los bordes: rango nulo (sin filtro), from = to (válido).
 */

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

test.group('assertRegistryRangeIsCoherent', () => {
  test('acepta rango coherente (from < to)', ({ assert }) => {
    const from = DateTime.fromISO('2026-01-01')
    const to = DateTime.fromISO('2026-06-30')
    assert.doesNotThrow(() => assertRegistryRangeIsCoherent(from, to))
  })

  test('acepta from igual a to (borde: mismo día)', ({ assert }) => {
    const day = DateTime.fromISO('2026-03-10')
    assert.doesNotThrow(() => assertRegistryRangeIsCoherent(day, day))
  })

  test('acepta cuando from es null (sin filtro de inicio)', ({ assert }) => {
    const to = DateTime.fromISO('2026-06-30')
    assert.doesNotThrow(() => assertRegistryRangeIsCoherent(null, to))
  })

  test('acepta cuando to es null (sin filtro de fin)', ({ assert }) => {
    const from = DateTime.fromISO('2026-01-01')
    assert.doesNotThrow(() => assertRegistryRangeIsCoherent(from, null))
  })

  test('acepta cuando ambos son null (sin filtro de rango)', ({ assert }) => {
    assert.doesNotThrow(() => assertRegistryRangeIsCoherent(null, null))
  })

  test('rechaza rango invertido con ETR.VAL.RANGE.001 (CA3)', ({ assert }) => {
    const from = DateTime.fromISO('2026-06-30')
    const to = DateTime.fromISO('2026-01-01')
    const error = captureError(() => assertRegistryRangeIsCoherent(from, to))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.equal(etr.errorCode, ETR_ERROR_CODES.RANGE_INVALID)
    assert.equal(etr.key, 'rango-fechas-invalido')
    assert.equal(etr.httpStatus, 400)
  })

  test('rechaza rango donde from es un día posterior a to', ({ assert }) => {
    const from = DateTime.fromISO('2026-03-11')
    const to = DateTime.fromISO('2026-03-10')
    const error = captureError(() => assertRegistryRangeIsCoherent(from, to))

    assert.instanceOf(error, TraumaticEventReportError)
    assert.equal((error as TraumaticEventReportError).errorCode, ETR_ERROR_CODES.RANGE_INVALID)
  })
})
