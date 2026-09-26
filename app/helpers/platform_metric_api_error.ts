import {
  PLATFORM_METRIC_ERROR_CODES,
  type PlatformMetricErrorTexts,
} from '../constants/platform_metric_error_codes.js'
import { PlatformMetricServiceError } from '../exceptions/platform_metric_service_error.js'

/** Respuesta de error HTTP normalizada: título, detalle, `key`, `code` y status listos para enviar. */
export type ResolvedPlatformMetricError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte una excepción del área de métricas en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo `PLT.MET.*`.
 *
 * A diferencia del molde de tenants (`platform_tenant_api_error.ts:16`), los
 * títulos entran por parámetro: el área sirve a cinco métricas con títulos
 * distintos y un literal cableado obligaría a un helper por métrica.
 *
 * @param error - Excepción atrapada por el controlador.
 * @param texts - Títulos y `key` de la métrica que está respondiendo.
 * @param fallbackStatus - Status del fallo no controlado. 500 por omisión.
 * @returns Cuerpo del error y su status HTTP.
 */
export function resolvePlatformMetricApiError(
  error: unknown,
  texts: PlatformMetricErrorTexts,
  fallbackStatus: number = 500
): ResolvedPlatformMetricError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      title: texts.failureTitle,
      detail: err.messages?.[0]?.message ?? 'Datos inválidos',
      key: texts.failureKey,
      code: PLATFORM_METRIC_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformMetricServiceError) {
    return {
      title: texts.failureTitle,
      detail: error.detail ?? error.message,
      key: error.key ?? texts.failureKey,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: texts.unhandledTitle,
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en métricas.',
    key: texts.unhandledKey,
    code: PLATFORM_METRIC_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
