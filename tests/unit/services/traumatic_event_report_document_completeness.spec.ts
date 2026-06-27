import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  assertDocumentComplete,
  REQUIRED_FIELDS_FOR_DOC,
} from '../../../app/services/traumatic_event_report_document_service.js'
import { TraumaticEventReportError } from '../../../app/exceptions/traumatic_event_report_error.js'
import { ETR_ERROR_CODES } from '../../../app/constants/traumatic_event_report_error_codes.js'

/**
 * Pruebas unitarias de la validación de completitud para el escrito §6.5
 * (NOM-035-STPS-2018). Corren sin base de datos.
 *
 * Cubren:
 *  - CA1: reporte completo no lanza error.
 *  - CA2: reporte con description vacía → 400 ETR.VAL.DOC.001.
 *  - CA3: reporte con involvedPeople vacío → 400 ETR.VAL.DOC.001.
 *  - CA4: reporte sin occurredAt → 400 ETR.VAL.DOC.001.
 *  - CA5: reporte sin elaboratedAt → 400 ETR.VAL.DOC.001.
 *  - CA6: múltiples campos faltantes → mensaje lista todos.
 *  - CA7: description de solo espacios se trata como vacía.
 */

const now = DateTime.now()

/** Fixture de reporte con todos los campos obligatorios presentes. */
function makeCompleteReport() {
  return {
    traumaticEventReportDescription: 'Descripción del acontecimiento traumático',
    traumaticEventReportInvolvedPeople: 'Supervisor Juan Pérez',
    traumaticEventReportOccurredAt: now,
    traumaticEventReportElaboratedAt: now,
  }
}

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (err) {
    return err
  }
}

test.group('assertDocumentComplete — validación de completitud §6.5', () => {
  test('reporte completo no lanza ningún error', ({ assert }) => {
    assert.doesNotThrow(() => assertDocumentComplete(makeCompleteReport()))
  })

  test('lanza ETR.VAL.DOC.001 cuando description está vacía', ({ assert }) => {
    const report = { ...makeCompleteReport(), traumaticEventReportDescription: '' }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.equal(etr.errorCode, ETR_ERROR_CODES.DOC_INCOMPLETE)
    assert.equal(etr.httpStatus, 400)
    assert.equal(etr.key, 'reporte-incompleto')
    assert.include(etr.message, 'traumaticEventReportDescription')
  })

  test('lanza ETR.VAL.DOC.001 cuando description es solo espacios', ({ assert }) => {
    const report = { ...makeCompleteReport(), traumaticEventReportDescription: '   ' }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    assert.equal((error as TraumaticEventReportError).errorCode, ETR_ERROR_CODES.DOC_INCOMPLETE)
  })

  test('lanza ETR.VAL.DOC.001 cuando involvedPeople está vacío', ({ assert }) => {
    const report = { ...makeCompleteReport(), traumaticEventReportInvolvedPeople: '' }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.equal(etr.errorCode, ETR_ERROR_CODES.DOC_INCOMPLETE)
    assert.include(etr.message, 'traumaticEventReportInvolvedPeople')
  })

  test('lanza ETR.VAL.DOC.001 cuando occurredAt es null', ({ assert }) => {
    const report = { ...makeCompleteReport(), traumaticEventReportOccurredAt: null as any }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.equal(etr.errorCode, ETR_ERROR_CODES.DOC_INCOMPLETE)
    assert.include(etr.message, 'traumaticEventReportOccurredAt')
  })

  test('lanza ETR.VAL.DOC.001 cuando elaboratedAt es null', ({ assert }) => {
    const report = { ...makeCompleteReport(), traumaticEventReportElaboratedAt: null as any }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.equal(etr.errorCode, ETR_ERROR_CODES.DOC_INCOMPLETE)
    assert.include(etr.message, 'traumaticEventReportElaboratedAt')
  })

  test('el mensaje lista TODOS los campos faltantes cuando faltan varios', ({ assert }) => {
    const report = {
      traumaticEventReportDescription: '',
      traumaticEventReportInvolvedPeople: '',
      traumaticEventReportOccurredAt: null as any,
      traumaticEventReportElaboratedAt: null as any,
    }
    const error = captureError(() => assertDocumentComplete(report))

    assert.instanceOf(error, TraumaticEventReportError)
    const etr = error as TraumaticEventReportError
    assert.include(etr.message, 'traumaticEventReportDescription')
    assert.include(etr.message, 'traumaticEventReportInvolvedPeople')
    assert.include(etr.message, 'traumaticEventReportOccurredAt')
    assert.include(etr.message, 'traumaticEventReportElaboratedAt')
  })

  test('REQUIRED_FIELDS_FOR_DOC contiene exactamente los 4 campos del escrito', ({ assert }) => {
    assert.equal(REQUIRED_FIELDS_FOR_DOC.length, 4)
    assert.include(REQUIRED_FIELDS_FOR_DOC, 'traumaticEventReportDescription')
    assert.include(REQUIRED_FIELDS_FOR_DOC, 'traumaticEventReportInvolvedPeople')
    assert.include(REQUIRED_FIELDS_FOR_DOC, 'traumaticEventReportOccurredAt')
    assert.include(REQUIRED_FIELDS_FOR_DOC, 'traumaticEventReportElaboratedAt')
  })
})
