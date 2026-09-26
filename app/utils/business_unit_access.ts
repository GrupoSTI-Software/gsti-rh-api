import BusinessUnit from '#models/business_unit'

/**
 * Resultado del parseo defensivo del input `userBusinessAccess`.
 *
 * Permite distinguir IDs explícitos (formato nuevo) de slugs heredados (CSV legado),
 * preservando además los tokens originales para reportarlos en los logs de deprecación.
 */
export interface BusinessUnitAccessInput {
  ids: number[]
  slugs: string[]
  legacyCsv: string | null
}

/**
 * Parsea el campo `userBusinessAccess` recibido por la API.
 *
 * - Si llega como arreglo, se asume que son IDs numéricos válidos (formato nuevo).
 * - Si llega como cadena, se interpreta como CSV legado donde cada token puede ser
 *   un número (ID) o un slug. Los tokens vacíos se descartan.
 * - Si llega null, undefined, vacío o un tipo no soportado, regresa colecciones vacías.
 *
 * El parseo es defensivo: no falla, solo agrupa lo que puede aprovechar el llamador.
 */
export function parseBusinessUnitAccessInput(value: unknown): BusinessUnitAccessInput {
  if (Array.isArray(value)) {
    const ids = value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
    return { ids, slugs: [], legacyCsv: null }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return { ids: [], slugs: [], legacyCsv: null }
    }

    const tokens = trimmed
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0)

    const ids: number[] = []
    const slugs: string[] = []

    for (const token of tokens) {
      const asNumber = Number(token)
      if (Number.isInteger(asNumber) && asNumber > 0 && `${asNumber}` === token) {
        ids.push(asNumber)
      } else {
        slugs.push(token)
      }
    }

    return { ids, slugs, legacyCsv: trimmed }
  }

  return { ids: [], slugs: [], legacyCsv: null }
}

/**
 * Resuelve los IDs válidos de unidades de negocio a partir del input parseado.
 *
 * Consulta `business_units` filtrando por IDs y slugs no soft-deleted, descartando
 * duplicados. Es la única ruta autorizada para traducir slugs legados a IDs reales
 * antes de escribir en la pivote.
 *
 * @returns Arreglo de IDs únicos existentes en la base de datos.
 */
export async function resolveBusinessUnitIds(input: BusinessUnitAccessInput): Promise<number[]> {
  const collected = new Set<number>()

  if (input.ids.length > 0) {
    const matchedByIds = await BusinessUnit.query()
      .whereIn('business_unit_id', input.ids)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')

    for (const businessUnit of matchedByIds) {
      collected.add(businessUnit.businessUnitId)
    }
  }

  if (input.slugs.length > 0) {
    const matchedBySlugs = await BusinessUnit.query()
      .whereIn('business_unit_slug', input.slugs)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')

    for (const businessUnit of matchedBySlugs) {
      collected.add(businessUnit.businessUnitId)
    }
  }

  return Array.from(collected)
}
