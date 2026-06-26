import { test } from '@japa/runner'
import { resolveTraumaticEventReferralApiError } from '../../../app/helpers/traumatic_event_referral_api_error.js'
import { TraumaticEventReferralError } from '#exceptions/traumatic_event_referral_error'
import { TraumaticEventReportError } from '#exceptions/traumatic_event_report_error'
import { TREF_ERROR_CODES } from '#constants/traumatic_event_referral_error_codes'
import { ETR_ERROR_CODES } from '#constants/traumatic_event_report_error_codes'

/**
 * Tests unitarios del resolver de errores del módulo de canalizaciones (sin BD).
 *
 * Verifica el mapeo a respuesta estable con campo `code`:
 *  - Validación VineJS → TREF.VAL.001 (CA5).
 *  - Error propio TREF → su code/key/status (CA7).
 *  - Error heredado del reporte (scope) → reexpone code ETR.* (CA4).
 *  - Cualquier otro error → fallback TREF.SYS.001.
 */

test.group('resolveTraumaticEventReferralApiError', () => {
  test('mapea error de validación VineJS a TREF.VAL.001 (CA5)', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'El nombre debe tener al menos 3 caracteres' }],
    }
    const resolved = resolveTraumaticEventReferralApiError(vineError, 400)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.code, TREF_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.message, 'El nombre debe tener al menos 3 caracteres')
  })

  test('propaga un TraumaticEventReferralError con su code, key y status (CA7)', ({ assert }) => {
    const error = new TraumaticEventReferralError(
      'La canalización no existe o no pertenece al reporte indicado.',
      TREF_ERROR_CODES.REFERRAL_NOT_FOUND,
      404,
      'canalizacion-no-encontrada'
    )
    const resolved = resolveTraumaticEventReferralApiError(error, 400)

    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, TREF_ERROR_CODES.REFERRAL_NOT_FOUND)
    assert.equal(resolved.key, 'canalizacion-no-encontrada')
  })

  test('reexpone un TraumaticEventReportError heredado como code ETR.* (CA4)', ({ assert }) => {
    const error = new TraumaticEventReportError(
      'El reporte de evento traumático no existe o está fuera del alcance del usuario.',
      ETR_ERROR_CODES.REPORT_NOT_FOUND,
      404,
      'reporte-no-encontrado'
    )
    const resolved = resolveTraumaticEventReferralApiError(error, 400)

    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, ETR_ERROR_CODES.REPORT_NOT_FOUND)
    assert.equal(resolved.key, 'reporte-no-encontrado')
  })

  test('cae a fallback TREF.SYS.001 ante un error desconocido', ({ assert }) => {
    const resolved = resolveTraumaticEventReferralApiError(new Error('boom'), 500)

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, TREF_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(resolved.message, 'boom')
  })
})
