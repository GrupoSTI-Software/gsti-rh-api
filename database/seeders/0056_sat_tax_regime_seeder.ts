import SatTaxRegime from '#models/sat_tax_regime'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  SAT_CATALOG_EXPECTED_COUNTS,
  SAT_TAX_REGIME_SEED_DATA,
} from '#database/data/sat_catalog_seed_data'

/**
 * Semilla idempotente de c_RegimenFiscal (USRH1786737531063).
 * Debe ejecutarse antes que `0057_sat_cfdi_use_seeder`.
 */
export default class extends BaseSeeder {
  async run() {
    for (const row of SAT_TAX_REGIME_SEED_DATA) {
      await SatTaxRegime.updateOrCreate(
        { satTaxRegimeCode: row.code },
        {
          satTaxRegimeDescription: row.description,
          satTaxRegimeAppliesToIndividual: row.appliesToIndividual ? 1 : 0,
          satTaxRegimeAppliesToLegalEntity: row.appliesToLegalEntity ? 1 : 0,
          satTaxRegimeActive: 1,
        }
      )
    }

    const count = await SatTaxRegime.query().count('* as total')
    const total = Number(count[0].$extras.total)

    if (total !== SAT_CATALOG_EXPECTED_COUNTS.taxRegimes) {
      throw new Error(
        `[sat_tax_regime_seeder] Se esperaban ${SAT_CATALOG_EXPECTED_COUNTS.taxRegimes} regímenes; hay ${total}.`
      )
    }
  }
}
