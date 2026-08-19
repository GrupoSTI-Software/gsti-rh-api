import {
  SAT_CATALOG_ERRORS,
  type SatCatalogErrorDefinition,
} from '#constants/sat_catalog_error_codes'
import { SatCatalogServiceError } from '#exceptions/sat_catalog_service_error'

function toServiceError(
  definition: SatCatalogErrorDefinition,
  detailOverride?: string
): SatCatalogServiceError {
  const detail = detailOverride ?? definition.detail

  return new SatCatalogServiceError(
    detail,
    definition.code,
    definition.status,
    definition.key,
    detail
  )
}

/** Catálogo vacío: migraciones sin seeder (regla 10). */
export function satCatalogUnavailableError(): SatCatalogServiceError {
  return toServiceError(SAT_CATALOG_ERRORS.CATALOG_UNAVAILABLE)
}

/** Convierte una definición del catálogo en excepción de dominio. */
export function satCatalogErrorFromDefinition(
  definition: SatCatalogErrorDefinition,
  detailOverride?: string
): SatCatalogServiceError {
  return toServiceError(definition, detailOverride)
}
