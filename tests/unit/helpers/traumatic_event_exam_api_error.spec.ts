import { test } from '@japa/runner'
import { resolveTraumaticEventExamApiError } from '../../../app/helpers/traumatic_event_exam_api_error.js'
import { TraumaticEventExamError } from '#exceptions/traumatic_event_exam_error'
import { TraumaticEventReportError } from '#exceptions/traumatic_event_report_error'
import { TEX_ERROR_CODES } from '#constants/traumatic_event_exam_error_codes'
import { ETR_ERROR_CODES } from '#constants/traumatic_event_report_error_codes'

/**
 * Tests unitarios del resolver de errores del módulo de exámenes (sin BD).
 *
 * Verifica el mapeo a respuesta estable con campo `code`:
 *  - Validación VineJS → TEX.VAL.001 (CA5).
 *  - Error propio TEX → su code/key/status (CA7).
 *  - Error heredado del reporte (scope) → reexpone code ETR.* (CA4).
 *  - Cualquier otro error → fallback TEX.SYS.001.
 */

test.group('resolveTraumaticEventExamApiError', () => {
  test('mapea error de validación VineJS a TEX.VAL.001 (CA5)', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'El tipo de examen es requerido' }],
    }
    const resolved = resolveTraumaticEventExamApiError(vineError, 400)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.code, TEX_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.message, 'El tipo de examen es requerido')
  })

  test('propaga un TraumaticEventExamError con su code, key y status (CA7)', ({ assert }) => {
    const error = new TraumaticEventExamError(
      'El resultado de examen no existe o no pertenece al reporte indicado.',
      TEX_ERROR_CODES.EXAM_NOT_FOUND,
      404,
      'examen-no-encontrado'
    )
    const resolved = resolveTraumaticEventExamApiError(error, 400)

    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, TEX_ERROR_CODES.EXAM_NOT_FOUND)
    assert.equal(resolved.key, 'examen-no-encontrado')
  })

  test('reexpone un TraumaticEventReportError heredado como code ETR.* (CA4)', ({ assert }) => {
    const error = new TraumaticEventReportError(
      'El reporte de evento traumático no existe o está fuera del alcance del usuario.',
      ETR_ERROR_CODES.REPORT_NOT_FOUND,
      404,
      'reporte-no-encontrado'
    )
    const resolved = resolveTraumaticEventExamApiError(error, 400)

    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, ETR_ERROR_CODES.REPORT_NOT_FOUND)
    assert.equal(resolved.key, 'reporte-no-encontrado')
  })

  test('propaga error de fecha anterior al evento con TEX.VAL.DATE.001', ({ assert }) => {
    const error = new TraumaticEventExamError(
      'La fecha del examen no puede ser anterior a la ocurrencia del evento.',
      TEX_ERROR_CODES.DATE_BEFORE_EVENT,
      400,
      'fecha-examen-anterior-al-evento'
    )
    const resolved = resolveTraumaticEventExamApiError(error, 400)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.code, TEX_ERROR_CODES.DATE_BEFORE_EVENT)
    assert.equal(resolved.key, 'fecha-examen-anterior-al-evento')
  })

  test('propaga error de fecha futura con TEX.VAL.DATE.002', ({ assert }) => {
    const error = new TraumaticEventExamError(
      'La fecha del examen no puede ser una fecha futura.',
      TEX_ERROR_CODES.DATE_FUTURE,
      400,
      'fecha-examen-futura'
    )
    const resolved = resolveTraumaticEventExamApiError(error, 400)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.code, TEX_ERROR_CODES.DATE_FUTURE)
    assert.equal(resolved.key, 'fecha-examen-futura')
  })

  test('cae a fallback TEX.SYS.001 ante un error desconocido', ({ assert }) => {
    const resolved = resolveTraumaticEventExamApiError(new Error('boom'), 500)

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, TEX_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(resolved.message, 'boom')
  })
})
