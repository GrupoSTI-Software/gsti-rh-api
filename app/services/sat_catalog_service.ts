import SatCfdiUse from '#models/sat_cfdi_use'
import SatTaxRegime from '#models/sat_tax_regime'
import { satCatalogUnavailableError } from '#helpers/sat_catalog_error'
import type {
  SatCatalogsResponse,
  SatCfdiUseCatalogItem,
  SatTaxRegimeCatalogItem,
} from '../interfaces/sat_catalog_interface.js'

/**
 * Servicio de lectura de catálogos fiscales del SAT (USRH1786737531063).
 * Referencia global; sin scope por tenant.
 */
export default class SatCatalogService {
  /**
   * Devuelve ambos catálogos íntegros (regla 8).
   * Falla en voz alta si alguna tabla está vacía (regla 10).
   */
  async getCatalogs(): Promise<SatCatalogsResponse> {
    const [taxRegimeRows, cfdiUseRows] = await Promise.all([
      SatTaxRegime.query().orderBy('satTaxRegimeCode', 'asc'),
      SatCfdiUse.query().preload('taxRegimes').orderBy('satCfdiUseCode', 'asc'),
    ])

    if (taxRegimeRows.length === 0 || cfdiUseRows.length === 0) {
      throw satCatalogUnavailableError()
    }

    return {
      taxRegimes: taxRegimeRows.map((row) => this.toTaxRegimeItem(row)),
      cfdiUses: cfdiUseRows.map((row) => this.toCfdiUseItem(row)),
    }
  }

  private toTaxRegimeItem(row: SatTaxRegime): SatTaxRegimeCatalogItem {
    return {
      code: row.satTaxRegimeCode,
      description: row.satTaxRegimeDescription,
      appliesToIndividual: row.satTaxRegimeAppliesToIndividual === 1,
      appliesToLegalEntity: row.satTaxRegimeAppliesToLegalEntity === 1,
    }
  }

  private toCfdiUseItem(row: SatCfdiUse): SatCfdiUseCatalogItem {
    const receiverRegimeCodes = row.taxRegimes
      .map((regime) => regime.satTaxRegimeCode)
      .sort((left, right) => left.localeCompare(right, 'es'))

    return {
      code: row.satCfdiUseCode,
      description: row.satCfdiUseDescription,
      appliesToIndividual: row.satCfdiUseAppliesToIndividual === 1,
      appliesToLegalEntity: row.satCfdiUseAppliesToLegalEntity === 1,
      receiverRegimeCodes,
    }
  }
}
