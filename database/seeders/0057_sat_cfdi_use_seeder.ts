import SatCfdiUse from '#models/sat_cfdi_use'
import SatTaxRegime from '#models/sat_tax_regime'
import db from '@adonisjs/lucid/services/db'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  SAT_CATALOG_EXPECTED_COUNTS,
  SAT_CFDI_USE_SEED_DATA,
} from '#database/data/sat_catalog_seed_data'

/**
 * Semilla idempotente de c_UsoCFDI y pivote uso↔régimen (USRH1786737531063).
 * Requiere `0056_sat_tax_regime_seeder` corrido previamente.
 */
export default class extends BaseSeeder {
  async run() {
    for (const row of SAT_CFDI_USE_SEED_DATA) {
      const use = await SatCfdiUse.updateOrCreate(
        { satCfdiUseCode: row.code },
        {
          satCfdiUseDescription: row.description,
          satCfdiUseAppliesToIndividual: row.appliesToIndividual ? 1 : 0,
          satCfdiUseAppliesToLegalEntity: row.appliesToLegalEntity ? 1 : 0,
          satCfdiUseActive: 1,
        }
      )

      const regimes = await SatTaxRegime.query().whereIn(
        'satTaxRegimeCode',
        [...row.receiverRegimeCodes]
      )

      if (regimes.length !== row.receiverRegimeCodes.length) {
        const found = new Set(regimes.map((regime) => regime.satTaxRegimeCode))
        const missing = row.receiverRegimeCodes.filter((code) => !found.has(code))
        throw new Error(
          `[sat_cfdi_use_seeder] Uso ${row.code}: faltan regímenes en catálogo: ${missing.join(', ')}`
        )
      }

      await use.related('taxRegimes').sync(regimes.map((regime) => regime.satTaxRegimeId))
    }

    const [useCountRow] = await SatCfdiUse.query().count('* as total')
    const [pivotCountRow] = await db.from('sat_cfdi_use_tax_regimes').count('* as total')

    const useTotal = Number(useCountRow.$extras.total)
    const pivotTotal = Number(pivotCountRow.total)

    if (useTotal !== SAT_CATALOG_EXPECTED_COUNTS.cfdiUses) {
      throw new Error(
        `[sat_cfdi_use_seeder] Se esperaban ${SAT_CATALOG_EXPECTED_COUNTS.cfdiUses} usos; hay ${useTotal}.`
      )
    }

    if (pivotTotal !== SAT_CATALOG_EXPECTED_COUNTS.pivotRows) {
      throw new Error(
        `[sat_cfdi_use_seeder] Se esperaban ${SAT_CATALOG_EXPECTED_COUNTS.pivotRows} filas de pivote; hay ${pivotTotal}.`
      )
    }
  }
}
