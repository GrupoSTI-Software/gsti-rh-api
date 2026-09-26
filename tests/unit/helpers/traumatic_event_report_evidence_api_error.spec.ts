import { test } from '@japa/runner'
import { TERE_ERROR_CODES } from '../../../app/constants/traumatic_event_report_evidence_error_codes.js'
import { TraumaticEventReportEvidenceError } from '../../../app/exceptions/traumatic_event_report_evidence_error.js'
import { TraumaticEventReportError } from '../../../app/exceptions/traumatic_event_report_error.js'
import { ETR_ERROR_CODES } from '../../../app/constants/traumatic_event_report_error_codes.js'
import { resolveTraumaticEventReportEvidenceApiError } from '../../../app/helpers/traumatic_event_report_evidence_api_error.js'

test.group('resolveTraumaticEventReportEvidenceApiError', () => {
  test('mapea un error de validación VineJS (E_VALIDATION_ERROR)', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      message: 'validation failed',
      messages: [{ message: 'El campo es obligatorio' }],
    }
    const result = resolveTraumaticEventReportEvidenceApiError(vineError, 400)
    assert.equal(result.code, TERE_ERROR_CODES.VAL_INPUT)
    assert.equal(result.status, 400)
    assert.equal(result.message, 'El campo es obligatorio')
  })

  test('extrae mensaje del primer elemento cuando messages está vacío', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      message: 'error de validación',
      messages: [],
    }
    const result = resolveTraumaticEventReportEvidenceApiError(vineError, 400)
    assert.equal(result.message, 'error de validación')
  })

  test('mapea TraumaticEventReportEvidenceError con su propio code y key', ({ assert }) => {
    const error = new TraumaticEventReportEvidenceError(
      'Evidencia no encontrada',
      TERE_ERROR_CODES.EVIDENCE_NOT_FOUND,
      404,
      'evidencia-no-encontrada'
    )
    const result = resolveTraumaticEventReportEvidenceApiError(error, 500)
    assert.equal(result.code, TERE_ERROR_CODES.EVIDENCE_NOT_FOUND)
    assert.equal(result.status, 404)
    assert.equal(result.key, 'evidencia-no-encontrada')
    assert.equal(result.message, 'Evidencia no encontrada')
  })

  test('mapea TraumaticEventReportError (padre 404) sin enmascararlo', ({ assert }) => {
    const parentError = new TraumaticEventReportError(
      'Reporte de evento traumático no encontrado.',
      ETR_ERROR_CODES.REPORT_NOT_FOUND,
      404,
      'reporte-no-encontrado'
    )
    const result = resolveTraumaticEventReportEvidenceApiError(parentError, 500)
    assert.equal(result.code, ETR_ERROR_CODES.REPORT_NOT_FOUND)
    assert.equal(result.status, 404)
    assert.equal(result.key, 'reporte-no-encontrado')
  })

  test('mapea error de tipo de archivo inválido', ({ assert }) => {
    const error = new TraumaticEventReportEvidenceError(
      'Solo se aceptan archivos PDF, JPG o PNG.',
      TERE_ERROR_CODES.INVALID_FILE_TYPE,
      400,
      'archivo-invalido'
    )
    const result = resolveTraumaticEventReportEvidenceApiError(error, 500)
    assert.equal(result.code, TERE_ERROR_CODES.INVALID_FILE_TYPE)
    assert.equal(result.status, 400)
    assert.equal(result.key, 'archivo-invalido')
  })

  test('mapea error S3 con status 500', ({ assert }) => {
    const error = new TraumaticEventReportEvidenceError(
      'Error al subir el archivo al almacenamiento.',
      TERE_ERROR_CODES.S3_OPERATION_FAILED,
      500,
      'evidencia-subida-fallida'
    )
    const result = resolveTraumaticEventReportEvidenceApiError(error, 400)
    assert.equal(result.code, TERE_ERROR_CODES.S3_OPERATION_FAILED)
    assert.equal(result.status, 500)
  })

  test('aplica fallback con SYS_UNHANDLED para errores no clasificados', ({ assert }) => {
    const unknownError = new Error('Error inesperado del sistema')
    const result = resolveTraumaticEventReportEvidenceApiError(unknownError, 503)
    assert.equal(result.code, TERE_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(result.status, 503)
    assert.equal(result.message, 'Error inesperado del sistema')
  })

  test('aplica fallback con mensaje genérico cuando error no tiene message', ({ assert }) => {
    const result = resolveTraumaticEventReportEvidenceApiError({}, 500)
    assert.equal(result.code, TERE_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(result.message, 'Error inesperado')
  })
})
