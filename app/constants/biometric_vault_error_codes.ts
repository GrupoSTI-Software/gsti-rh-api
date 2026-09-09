/**
 * Errores de la boveda de biometricos (spec ADMS 12).
 * Gramatica `BVLT.<BUCKET>.NNN`.
 */
export const BIOMETRIC_VAULT_ERROR_CODES = {
  /** El blob no es base64 valido o esta fuera de la banda de su modalidad. */
  VAL_INVALID_TEMPLATE: 'BVLT.VAL.001',
  /** Falta un dato obligatorio del biometrico. */
  VAL_MISSING_FIELD: 'BVLT.VAL.002',
  /** La version del template no es compatible con el equipo destino. */
  COMPAT_VERSION: 'BVLT.COMPAT.001',
  /** El colaborador no ha dado su consentimiento biometrico. */
  CONSENT_MISSING: 'BVLT.CONSENT.001',
  /** No hay un documento de consentimiento vigente que firmar. */
  CONSENT_NO_DOCUMENT: 'BVLT.CONSENT.002',
  /** La foto no pasa la evaluacion de calidad. */
  PHOTO_QUALITY: 'BVLT.PHOTO.001',
  /** El colaborador no tiene foto biometrica. */
  PHOTO_MISSING: 'BVLT.PHOTO.002',
  /** El uso de la foto en dispositivos no esta activado. */
  PHOTO_FLAG_OFF: 'BVLT.PHOTO.003',
  /** El almacenamiento no acepto el derivado. */
  PHOTO_STORAGE: 'BVLT.PHOTO.004',
  /** El pivote del colaborador en ese equipo no tiene PIN. */
  PIN_MISSING: 'BVLT.PIN.001',
  /** Lectura de un template sin sesion que la respalde. */
  AUTHZ_NO_ACTOR: 'BVLT.AUTHZ.001',
  /** Recurso fuera del alcance de la peticion. */
  AUTHZ_OUT_OF_SCOPE: 'BVLT.AUTHZ.002',
  /** No clasificado. */
  SYS_INTERNAL: 'BVLT.SYS.001',
} as const

export type BiometricVaultErrorCode =
  (typeof BIOMETRIC_VAULT_ERROR_CODES)[keyof typeof BIOMETRIC_VAULT_ERROR_CODES]
