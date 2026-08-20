import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { MASK_CHAR, maskSensitiveValue } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const catalog = new SensitiveFieldsCatalogService()

/**
 * Fábrica de `serialize` para columnas clasificadas (USRH1787204602825).
 *
 * Resuelve la categoría una vez al evaluar el decorador (carga del módulo).
 * Si el par no está en el catálogo, tapa siempre con máscara total: nunca
 * en claro por omisión.
 */
export function sensitiveSerialize(
  model: string,
  column: string
): (value: string | null) => string | null {
  const category = catalog.categoryOf(model, column)

  return (value: string | null): string | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return MASK_CHAR.repeat(5)
    }

    if (SensitiveAccessContext.canRead(category)) {
      return value
    }

    return maskSensitiveValue(value, category)
  }
}
