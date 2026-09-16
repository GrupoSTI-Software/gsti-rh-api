/**
 * Constantes de la boveda de biometricos (spec ADMS 7.1).
 *
 * Los tipos son los que el equipo declara en `Type=` de `BIODATA`, medidos en
 * hardware: `1` huella (`MajorVer=13` en el SenseFace) y `9` rostro
 * (`MajorVer=39` en el V5L).
 */
export const BIO_TYPE = {
  FINGERPRINT: 1,
  FACE: 9,
  PALM: 8,
} as const

export type BioType = (typeof BIO_TYPE)[keyof typeof BIO_TYPE]

/**
 * Bandas de longitud del base64 por modalidad. Un blob fuera de banda no es un
 * biometrico: es basura, un truncado o un intento de meter otra cosa. Medidas
 * de referencia: huella de 1120 a 1491 caracteres, rostro de ~1400.
 */
export const TEMPLATE_SIZE_BANDS: Readonly<Record<number, { min: number; max: number }>> = {
  [BIO_TYPE.FINGERPRINT]: { min: 512, max: 4096 },
  [BIO_TYPE.FACE]: { min: 128, max: 8192 },
  [BIO_TYPE.PALM]: { min: 512, max: 8192 },
}

/** Banda para una modalidad que el equipo declare y que no esté en el mapa. */
export const TEMPLATE_SIZE_BAND_DEFAULT = { min: 128, max: 8192 }

/** PIN tal como el equipo lo declara en `Pin=` o `PIN=`. */
export const BIO_PIN_PATTERN = /^\d{1,20}$/

/** Base64 estandar, con o sin relleno. El blob viaja verbatim. */
export const TEMPLATE_BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

export const BIOMETRIC_VAULT_UNSCOPED_REASON =
  'boveda de biometricos: lectura del template por id para replicacion, con acceso asentado'
