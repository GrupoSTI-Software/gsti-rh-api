import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { REPSE_EXPEDIENTE_ERROR_CODES } from '#constants/repse_expediente_error_codes'
import { RepseExpedienteError } from '#exceptions/repse_expediente_error'
import {
  EXPEDIENTE_ELEVATED_ROLE_SLUGS,
  MAX_EXPEDIENTE_FILE_BYTES,
  formatRepseExpedienteTiposForMessage,
} from '#modules/repse-providers/expediente/expediente.constants'
import { assertExpedienteFileValid } from '#modules/repse-providers/expediente/expediente_file_validation'
import {
  computeConservarHasta,
  isRetentionActive,
} from '#modules/repse-providers/expediente/expediente_retention'

test.group('repse expediente retention', () => {
  test('computeConservarHasta suma 5 años desde la fecha del documento', ({ assert }) => {
    const fecha = DateTime.fromISO('2020-06-15', { zone: 'America/Mexico_City' })
    const result = computeConservarHasta(fecha, fecha)
    assert.equal(result.toISODate(), '2025-06-15')
  })

  test('computeConservarHasta usa la fecha de referencia cuando no hay fechaDocumento', ({ assert }) => {
    const ref = DateTime.fromISO('2024-01-10', { zone: 'America/Mexico_City' })
    const result = computeConservarHasta(null, ref)
    assert.equal(result.toISODate(), '2029-01-10')
  })

  test('isRetentionActive es true cuando conservarHasta es posterior a hoy', ({ assert }) => {
    const hoy = DateTime.fromISO('2024-01-01', { zone: 'America/Mexico_City' })
    const conservar = DateTime.fromISO('2025-01-01', { zone: 'America/Mexico_City' })
    assert.isTrue(isRetentionActive(conservar, hoy))
  })

  test('isRetentionActive es false cuando conservarHasta es igual a hoy', ({ assert }) => {
    const hoy = DateTime.fromISO('2025-01-01', { zone: 'America/Mexico_City' })
    assert.isFalse(isRetentionActive(hoy, hoy))
  })
})

test.group('repse expediente file validation', () => {
  test('rechaza ausencia de archivo', ({ assert }) => {
    try {
      assertExpedienteFileValid(null)
      assert.fail('Debió lanzar RepseExpedienteError')
    } catch (error) {
      assert.instanceOf(error, RepseExpedienteError)
      assert.equal((error as RepseExpedienteError).key, 'archivo-faltante')
      assert.match((error as RepseExpedienteError).message, /'archivo'/)
    }
  })

  test('rechaza tipo distinto de PDF', ({ assert }) => {
    try {
      assertExpedienteFileValid({
        extname: 'png',
        type: 'image',
        subtype: 'png',
        size: 1024,
      })
      assert.fail('Debió lanzar RepseExpedienteError')
    } catch (error) {
      assert.instanceOf(error, RepseExpedienteError)
      assert.match((error as RepseExpedienteError).message, /Solo se acepta PDF/)
    }
  })

  test('rechaza tamaño mayor a 10 MB', ({ assert }) => {
    try {
      assertExpedienteFileValid({
        extname: 'pdf',
        type: 'application',
        subtype: 'pdf',
        size: MAX_EXPEDIENTE_FILE_BYTES + 1,
      })
      assert.fail('Debió lanzar RepseExpedienteError')
    } catch (error) {
      assert.instanceOf(error, RepseExpedienteError)
      assert.match((error as RepseExpedienteError).message, /10 MB/)
    }
  })

  test('acepta PDF válido', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertExpedienteFileValid({
        extname: 'pdf',
        type: 'application',
        subtype: 'pdf',
        size: 1024,
      })
    )
  })
})

test.group('repse expediente elevated roles', () => {
  test('roles elevados incluyen root, super-administrador y owner', ({ assert }) => {
    assert.includeMembers([...EXPEDIENTE_ELEVATED_ROLE_SLUGS], [
      'root',
      'super-administrador',
      'owner',
    ])
  })

  test('error de retención usa código REXP.FORBID.RET.001', ({ assert }) => {
    const error = new RepseExpedienteError(
      'retención',
      REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN_RETENTION,
      403,
      'retencion-vigente'
    )
    assert.equal(error.errorCode, 'REXP.FORBID.RET.001')
    assert.equal(error.key, 'retencion-vigente')
  })
})

test.group('repse expediente tipo catalog message', () => {
  test('formatRepseExpedienteTiposForMessage lista todas las opciones válidas', ({ assert }) => {
    const formatted = formatRepseExpedienteTiposForMessage()
    assert.include(formatted, "'contrato'")
    assert.include(formatted, "'anexo-15d'")
    assert.include(formatted, "'retencion-isr'")
  })
})
