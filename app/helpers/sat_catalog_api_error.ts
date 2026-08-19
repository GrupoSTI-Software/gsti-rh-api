import {
  SAT_CATALOG_ERRORS,
  type SatCatalogErrorDefinition,
} from '#constants/sat_catalog_error_codes'
import { SatCatalogServiceError } from '#exceptions/sat_catalog_service_error'

export type ResolvedSatCatalogError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

function fromDefinition(
  definition: SatCatalogErrorDefinition,
  detailOverride?: string
): ResolvedSatCatalogError {
  return {
    title: definition.title,
    detail: detailOverride ?? definition.detail,
    key: definition.key,
    code: definition.code,
    status: definition.status,
  }
}

function resolveDefinitionByCode(code: string): SatCatalogErrorDefinition | undefined {
  return Object.values(SAT_CATALOG_ERRORS).find((entry) => entry.code === code)
}

/**
 * Convierte excepciones del módulo de catálogos SAT en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo SAT.CAT.*.
 */
export function resolveSatCatalogApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedSatCatalogError {
  const err = error as { message?: string }

  if (error instanceof SatCatalogServiceError) {
    const definition = resolveDefinitionByCode(error.errorCode)

    return {
      title: definition?.title ?? SAT_CATALOG_ERRORS.SYS_UNHANDLED.title,
      detail: error.detail ?? error.message,
      key: error.key ?? definition?.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  const unhandled = fromDefinition(
    SAT_CATALOG_ERRORS.SYS_UNHANDLED,
    typeof err?.message === 'string' ? err.message : SAT_CATALOG_ERRORS.SYS_UNHANDLED.detail
  )

  return {
    ...unhandled,
    status: fallbackStatus,
  }
}
