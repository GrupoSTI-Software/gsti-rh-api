import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/limiter'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'

export function isContratoImportExcelPath(url: string): boolean {
  return /\/contratos-servicios-especializados\/importacion\/?(\?|$)/.test(url)
}

export function isContratoImportRateLimitError(
  error: unknown
): error is InstanceType<typeof errors.E_TOO_MANY_REQUESTS> {
  if (error instanceof errors.E_TOO_MANY_REQUESTS) {
    return true
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'E_TOO_MANY_REQUESTS' &&
    'response' in error
  )
}

/** Respuesta GSTI estándar para rate-limit de importación de contratos por Excel. */
export function respondContratoImportRateLimit(
  ctx: Pick<HttpContext, 'i18n' | 'response'>,
  error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>
) {
  const { i18n, response } = ctx
  const title = i18n.t(
    'contrato_servicio_especializado_importacion_rate_limit_title',
    undefined,
    'Límite de intentos de importación alcanzado'
  )
  const message = i18n.t(
    'contrato_servicio_especializado_importacion_rate_limit_message',
    undefined,
    'Alcanzó el límite de intentos de importación de contratos. Intente de nuevo más tarde.'
  )

  return response
    .status(429)
    .header('X-RateLimit-Limit', error.response.limit)
    .header('X-RateLimit-Remaining', error.response.remaining)
    .header('Retry-After', error.response.availableIn)
    .header(
      'X-RateLimit-Reset',
      new Date(Date.now() + error.response.availableIn * 1000).toISOString()
    )
    .json({
      type: 'error',
      title,
      message,
      detail: message,
      key: 'importacion-rate-limit',
      errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_RATE_LIMIT,
      data: null,
    })
}

export function resolveContratoImportGlobalErrorTitle(
  i18n: HttpContext['i18n'],
  key: string
): string {
  if (key === 'cabeceras-invalidas') {
    return i18n.t(
      'contrato_servicio_especializado_importacion_cabeceras_invalidas_title',
      undefined,
      'Cabeceras inválidas'
    )
  }

  if (key === 'filas-excedidas') {
    return i18n.t(
      'contrato_servicio_especializado_importacion_filas_excedidas_title',
      undefined,
      'Demasiadas filas en el archivo'
    )
  }

  return i18n.t(
    'contrato_servicio_especializado_importacion_archivo_invalido_title',
    undefined,
    'Archivo inválido'
  )
}
