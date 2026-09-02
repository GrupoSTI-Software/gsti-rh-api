import { test } from '@japa/runner'
import {
  PLATFORM_METRIC_ERROR_CODES,
  RECEIVABLES_METRIC_ERROR_TEXTS,
} from '../../../app/constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../../../app/exceptions/platform_metric_service_error.js'
import { resolvePlatformMetricApiError } from '../../../app/helpers/platform_metric_api_error.js'

/**
 * USRH1788052455651 — superficie compartida del área de métricas de plataforma.
 * El contrato del error es lo primero que consumen las cuatro métricas que
 * vienen después, así que sus tres ramas se fijan aquí.
 */
test.group('resolvePlatformMetricApiError', () => {
  test('error de Vine → 422 con el título y el key kebab de la métrica', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'El límite de resultados por página no puede ser mayor a 100.' }],
    }

    const resolved = resolvePlatformMetricApiError(vineError, RECEIVABLES_METRIC_ERROR_TEXTS)

    assert.equal(resolved.status, 422)
    assert.equal(resolved.title, 'No fue posible obtener la cartera vencida')
    assert.equal(resolved.detail, 'El límite de resultados por página no puede ser mayor a 100.')
    assert.equal(resolved.key, 'no-fue-posible-obtener-la-cartera-vencida')
    assert.equal(resolved.code, PLATFORM_METRIC_ERROR_CODES.VAL_INPUT)
  })

  test('el key nunca repite el code: son campos distintos (desmentido 3 del spec)', ({
    assert,
  }) => {
    const resolved = resolvePlatformMetricApiError(
      { code: 'E_VALIDATION_ERROR', messages: [{ message: 'x' }] },
      RECEIVABLES_METRIC_ERROR_TEXTS
    )

    assert.notEqual(resolved.key, resolved.code)
    assert.notInclude(resolved.key, 'PLT.MET')
  })

  test('excepción de dominio → conserva su status, su key y su detail', ({ assert }) => {
    const error = new PlatformMetricServiceError(
      'mensaje interno',
      PLATFORM_METRIC_ERROR_CODES.VAL_INPUT,
      409,
      'un-key-propio',
      'Detalle para el cliente.'
    )

    const resolved = resolvePlatformMetricApiError(error, RECEIVABLES_METRIC_ERROR_TEXTS)

    assert.equal(resolved.status, 409)
    assert.equal(resolved.title, 'No fue posible obtener la cartera vencida')
    assert.equal(resolved.detail, 'Detalle para el cliente.')
    assert.equal(resolved.key, 'un-key-propio')
    assert.equal(resolved.code, PLATFORM_METRIC_ERROR_CODES.VAL_INPUT)
  })

  test('error desconocido → 500 con el título y el key de fallo no controlado', ({ assert }) => {
    const resolved = resolvePlatformMetricApiError(
      new Error('cualquier cosa'),
      RECEIVABLES_METRIC_ERROR_TEXTS
    )

    assert.equal(resolved.status, 500)
    assert.equal(resolved.title, 'Error inesperado al obtener la cartera vencida')
    assert.equal(resolved.key, 'error-inesperado-al-obtener-la-cartera-vencida')
    assert.equal(resolved.code, PLATFORM_METRIC_ERROR_CODES.SYS_UNHANDLED)
  })
})
