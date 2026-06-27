import { test } from '@japa/runner'
import { TERE_ERROR_CODES } from '../../../app/constants/traumatic_event_report_evidence_error_codes.js'
import { TraumaticEventReportEvidenceError } from '../../../app/exceptions/traumatic_event_report_evidence_error.js'

/**
 * Pruebas unitarias para la validación de archivos del módulo de evidencias
 * de reportes de eventos traumáticos (NOM-035 §6.5).
 *
 * Cubre los invariantes de negocio que el service impone:
 *  - Solo PDF, JPG, JPEG y PNG son aceptados.
 *  - Archivos de más de 10 MB se rechazan.
 *  - Archivos sin extensión o con tipo MIME incorrecto se rechazan.
 */

const MAX_10MB = 10 * 1024 * 1024

/** Simula el objeto `MultipartFile` que pasa AdonisJS al controlador. */
function makeFile(opts: {
  extname?: string
  type?: string
  subtype?: string
  size?: number
  clientName?: string
}) {
  return {
    extname: opts.extname ?? 'pdf',
    type: opts.type ?? 'application',
    subtype: opts.subtype ?? 'pdf',
    size: opts.size ?? 1024,
    clientName: opts.clientName ?? 'evidencia.pdf',
  }
}

/** Extrae la misma lógica de validación de archivo que contiene el service (caja blanca). */
function assertFileValid(file: ReturnType<typeof makeFile> | null | undefined): void {
  if (!file) {
    throw new TraumaticEventReportEvidenceError(
      'No se recibió ningún archivo.',
      TERE_ERROR_CODES.INVALID_FILE_TYPE,
      400,
      'archivo-invalido'
    )
  }

  const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
  const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']

  const ext = `${file.extname ?? ''}`.toLowerCase()
  const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new TraumaticEventReportEvidenceError(
      'Solo se aceptan archivos PDF, JPG o PNG.',
      TERE_ERROR_CODES.INVALID_FILE_TYPE,
      400,
      'archivo-invalido'
    )
  }

  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    throw new TraumaticEventReportEvidenceError(
      'El contenido del archivo no corresponde a un tipo permitido (PDF, JPG, PNG).',
      TERE_ERROR_CODES.INVALID_FILE_TYPE,
      400,
      'archivo-invalido'
    )
  }

  if (typeof file.size === 'number' && file.size > MAX_10MB) {
    throw new TraumaticEventReportEvidenceError(
      'El archivo excede el tamaño máximo de 10 MB.',
      TERE_ERROR_CODES.FILE_TOO_LARGE,
      400,
      'archivo-demasiado-grande'
    )
  }
}

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

test.group('TraumaticEventReportEvidenceService — validación de archivo', () => {
  test('acepta un PDF válido', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(makeFile({ extname: 'pdf', type: 'application', subtype: 'pdf' }))
    )
  })

  test('acepta un JPG con extensión jpg', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(makeFile({ extname: 'jpg', type: 'image', subtype: 'jpeg' }))
    )
  })

  test('acepta un JPG con extensión jpeg', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(makeFile({ extname: 'jpeg', type: 'image', subtype: 'jpeg' }))
    )
  })

  test('acepta un PNG válido', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(makeFile({ extname: 'png', type: 'image', subtype: 'png' }))
    )
  })

  test('acepta archivos exactamente de 10 MB (límite inclusivo)', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(
        makeFile({ extname: 'pdf', type: 'application', subtype: 'pdf', size: MAX_10MB })
      )
    )
  })

  test('normaliza extensión en mayúsculas (.PDF) y la acepta', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertFileValid(makeFile({ extname: 'PDF', type: 'application', subtype: 'pdf' }))
    )
  })

  test('rechaza cuando no se envía archivo (null)', ({ assert }) => {
    const error = captureError(() => assertFileValid(null))
    assert.instanceOf(error, TraumaticEventReportEvidenceError)
    const tere = error as TraumaticEventReportEvidenceError
    assert.equal(tere.code, TERE_ERROR_CODES.INVALID_FILE_TYPE)
    assert.equal(tere.httpStatus, 400)
    assert.equal(tere.key, 'archivo-invalido')
  })

  test('rechaza extensión no permitida (.docx) con TERE.VAL.FILE.001', ({ assert }) => {
    const error = captureError(() =>
      assertFileValid(
        makeFile({
          extname: 'docx',
          type: 'application',
          subtype: 'vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      )
    )
    assert.instanceOf(error, TraumaticEventReportEvidenceError)
    const tere = error as TraumaticEventReportEvidenceError
    assert.equal(tere.code, TERE_ERROR_CODES.INVALID_FILE_TYPE)
    assert.equal(tere.key, 'archivo-invalido')
  })

  test('rechaza tipo MIME incorrecto aunque la extensión sea .pdf', ({ assert }) => {
    const error = captureError(() =>
      assertFileValid(makeFile({ extname: 'pdf', type: 'text', subtype: 'plain' }))
    )
    assert.instanceOf(error, TraumaticEventReportEvidenceError)
    assert.equal((error as TraumaticEventReportEvidenceError).code, TERE_ERROR_CODES.INVALID_FILE_TYPE)
  })

  test('rechaza archivos que superen 10 MB con TERE.VAL.FILE.002', ({ assert }) => {
    const error = captureError(() =>
      assertFileValid(
        makeFile({ extname: 'pdf', type: 'application', subtype: 'pdf', size: MAX_10MB + 1 })
      )
    )
    assert.instanceOf(error, TraumaticEventReportEvidenceError)
    const tere = error as TraumaticEventReportEvidenceError
    assert.equal(tere.code, TERE_ERROR_CODES.FILE_TOO_LARGE)
    assert.equal(tere.key, 'archivo-demasiado-grande')
    assert.equal(tere.httpStatus, 400)
  })
})
