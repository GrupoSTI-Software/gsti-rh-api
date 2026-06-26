import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { assertExamDateWithinEvent } from '#services/traumatic_event_exam_service'
import { TraumaticEventExamError } from '#exceptions/traumatic_event_exam_error'
import { TEX_ERROR_CODES } from '#constants/traumatic_event_exam_error_codes'

/**
 * Tests unitarios de la validación de fecha del resultado de examen (sin BD).
 *
 * Cubre los criterios de aceptación CA2 (anterior al evento) y CA3 (futura),
 * además de los bordes: igual a la ocurrencia (válido) e igual a hoy (válido).
 * Se inyecta `now` fijo para que la prueba sea determinista.
 */

const occurred = DateTime.fromISO('2026-03-10', { zone: 'UTC-6' })
const now = DateTime.fromISO('2026-06-21', { zone: 'UTC-6' })

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

test.group('assertExamDateWithinEvent', () => {
  test('acepta una fecha posterior al evento y no futura', ({ assert }) => {
    const performed = DateTime.fromISO('2026-04-01', { zone: 'UTC-6' })
    assert.doesNotThrow(() => assertExamDateWithinEvent(performed, occurred, now))
  })

  test('acepta la fecha exactamente igual a la ocurrencia (borde inferior)', ({ assert }) => {
    assert.doesNotThrow(() => assertExamDateWithinEvent(occurred, occurred, now))
  })

  test('acepta la fecha igual a hoy (borde superior)', ({ assert }) => {
    assert.doesNotThrow(() => assertExamDateWithinEvent(now, occurred, now))
  })

  test('rechaza fecha anterior al evento con TEX.VAL.DATE.001 (CA2)', ({ assert }) => {
    const performed = DateTime.fromISO('2026-03-09', { zone: 'UTC-6' })
    const error = captureError(() => assertExamDateWithinEvent(performed, occurred, now))

    assert.instanceOf(error, TraumaticEventExamError)
    const tex = error as TraumaticEventExamError
    assert.equal(tex.code, TEX_ERROR_CODES.DATE_BEFORE_EVENT)
    assert.equal(tex.key, 'fecha-examen-anterior-al-evento')
    assert.equal(tex.httpStatus, 400)
  })

  test('rechaza fecha futura con TEX.VAL.DATE.002 (CA3)', ({ assert }) => {
    const performed = DateTime.fromISO('2026-06-22', { zone: 'UTC-6' })
    const error = captureError(() => assertExamDateWithinEvent(performed, occurred, now))

    assert.instanceOf(error, TraumaticEventExamError)
    const tex = error as TraumaticEventExamError
    assert.equal(tex.code, TEX_ERROR_CODES.DATE_FUTURE)
    assert.equal(tex.key, 'fecha-examen-futura')
    assert.equal(tex.httpStatus, 400)
  })

  test('prioriza el error de "anterior al evento" sobre cualquier otra condición', ({ assert }) => {
    const performed = DateTime.fromISO('2026-01-01', { zone: 'UTC-6' })
    const error = captureError(() => assertExamDateWithinEvent(performed, occurred, now))

    assert.instanceOf(error, TraumaticEventExamError)
    assert.equal((error as TraumaticEventExamError).code, TEX_ERROR_CODES.DATE_BEFORE_EVENT)
  })
})
