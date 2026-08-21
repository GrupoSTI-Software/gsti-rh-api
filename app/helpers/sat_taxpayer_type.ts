import { normalizeRfc } from '../shared/validators/rfc.validator.js'

/** Tipo de contribuyente derivado del RFC capturado (USRH1786737531066). */
export type SatTaxpayerType = 'fisica' | 'moral'

/**
 * Deriva persona física o moral a partir de la longitud del RFC normalizado.
 * 12 caracteres → moral; 13 → física; otro valor o ausencia → null.
 */
export function deriveTaxpayerTypeFromRfc(rfc: string | null): SatTaxpayerType | null {
  if (rfc === null || rfc === undefined) {
    return null
  }

  const normalized = normalizeRfc(rfc)

  if (normalized.length === 12) {
    return 'moral'
  }

  if (normalized.length === 13) {
    return 'fisica'
  }

  return null
}
