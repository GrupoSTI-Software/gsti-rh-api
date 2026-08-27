/**
 * Datos semilla del catálogo de modelos de dispositivo biométrico autorizados
 * por GSTI (USRH1787189981870). Dos modelos ya aprobados al momento del alta.
 *
 * El slug es el identificador inmutable que el landlord usa para resolver la
 * foto de referencia (`public/devices/<slug>.webp`).
 */
export interface PlatformDeviceModelSeedRow {
  brand: string
  name: string
  slug: string
}

export const PLATFORM_DEVICE_MODEL_SEED_DATA: PlatformDeviceModelSeedRow[] = [
  {
    brand: 'ZKTeco',
    name: 'SpeedFace V5L',
    slug: 'zkteco-speedface-v5l',
  },
  {
    brand: 'ZKTeco',
    name: 'SenseFace 2A',
    slug: 'zkteco-senseface-2a',
  },
]

export const PLATFORM_DEVICE_MODEL_EXPECTED_COUNT = PLATFORM_DEVICE_MODEL_SEED_DATA.length
