/**
 * Contrato HTTP de los catálogos fiscales del SAT (USRH1786737531063).
 *
 * Formas fijadas para "Completar los datos de emisión del CFDI" y el landlord GSTI.
 * Errores: `{ title, detail, key, code }` vía prefijo `SAT.CAT.*`.
 */

/** Entrada de c_RegimenFiscal expuesta al cliente. */
export interface SatTaxRegimeCatalogItem {
  /** Clave oficial de c_RegimenFiscal, p. ej. '601'. */
  code: string
  /** Descripción literal publicada por el SAT. */
  description: string
  appliesToIndividual: boolean
  appliesToLegalEntity: boolean
}

/** Entrada de c_UsoCFDI expuesta al cliente. */
export interface SatCfdiUseCatalogItem {
  /** Clave oficial de c_UsoCFDI, p. ej. 'G03'. */
  code: string
  /** Descripción literal publicada por el SAT. */
  description: string
  appliesToIndividual: boolean
  appliesToLegalEntity: boolean
  /** Claves de c_RegimenFiscal del receptor admitidas para este uso. */
  receiverRegimeCodes: string[]
}

/** Respuesta de lectura de ambos catálogos (regla 8: catálogo íntegro). */
export interface SatCatalogsResponse {
  taxRegimes: SatTaxRegimeCatalogItem[]
  cfdiUses: SatCfdiUseCatalogItem[]
}

/** Envoltura de éxito de GET `/api/billing/sat-catalogs`. */
export interface SatCatalogSuccessResponse {
  type: 'success'
  data: SatCatalogsResponse
}
