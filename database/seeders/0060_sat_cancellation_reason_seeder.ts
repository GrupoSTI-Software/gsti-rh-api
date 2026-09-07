import SatCancellationReason from '#models/sat_cancellation_reason'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  SAT_CANCELLATION_REASON_EXPECTED_COUNT,
  SAT_CANCELLATION_REASON_SEED_DATA,
} from '../data/sat_cancellation_reason_seed_data.js'

/**
 * Semilla idempotente de c_MotivoCancelacion (USRH1788288461952).
 *
 * Numeración `0060`: `0059` ya lo ocupa `0059_system_module_group_seeder`.
 * Es requisito de despliegue: sin estas 4 filas, GET /api/billing/sat-catalogs
 * responde 500 (`SAT.CAT.CATALOG_UNAVAILABLE`) porque la guarda del servicio
 * exige los tres catálogos poblados.
 */
export default class extends BaseSeeder {
  async run() {
    for (const row of SAT_CANCELLATION_REASON_SEED_DATA) {
      await SatCancellationReason.updateOrCreate(
        { satCancellationReasonCode: row.code },
        {
          satCancellationReasonDescription: row.description,
          satCancellationReasonRequiresSubstitute: row.requiresSubstitute ? 1 : 0,
          satCancellationReasonActive: 1,
        }
      )
    }

    const count = await SatCancellationReason.query().count('* as total')
    const total = Number(count[0].$extras.total)

    if (total !== SAT_CANCELLATION_REASON_EXPECTED_COUNT) {
      throw new Error(
        `[sat_cancellation_reason_seeder] Se esperaban ${SAT_CANCELLATION_REASON_EXPECTED_COUNT} motivos; hay ${total}.`
      )
    }
  }
}
