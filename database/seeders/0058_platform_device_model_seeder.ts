import { BaseSeeder } from '@adonisjs/lucid/seeders'
import PlatformDeviceModel from '#models/platform_device_model'
import {
  PLATFORM_DEVICE_MODEL_SEED_DATA,
  PLATFORM_DEVICE_MODEL_EXPECTED_COUNT,
} from '#database/data/platform_device_model_seed_data'

/**
 * Semilla idempotente del catálogo de modelos de dispositivo biométrico
 * autorizados (USRH1787189981870). Los dos modelos iniciales nacen como
 * `vigente`. Usar `updateOrCreate` (no `firstOrCreate`) para que correcciones
 * de marca o nombre propaguen al volver a correr el seeder.
 */
export default class extends BaseSeeder {
  async run() {
    for (const row of PLATFORM_DEVICE_MODEL_SEED_DATA) {
      await PlatformDeviceModel.updateOrCreate(
        { platformDeviceModelSlug: row.slug },
        {
          platformDeviceModelBrand: row.brand,
          platformDeviceModelName: row.name,
          platformDeviceModelStatus: 'vigente',
          platformDeviceModelActive: 1,
        }
      )
    }

    const count = await PlatformDeviceModel.query()
      .whereNull('platform_device_model_deleted_at')
      .count('* as total')
    const total = Number(count[0].$extras.total)

    if (total < PLATFORM_DEVICE_MODEL_EXPECTED_COUNT) {
      throw new Error(
        '[0058_platform_device_model_seeder] Se esperaban al menos ' +
          `${PLATFORM_DEVICE_MODEL_EXPECTED_COUNT} modelos; hay ${total}.`
      )
    }
  }
}
