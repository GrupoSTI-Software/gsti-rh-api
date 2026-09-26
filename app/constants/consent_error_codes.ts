/**
 * Códigos estables para el cliente (consentimiento legal por documento).
 * Prefijo CSNT = Consent.
 */
export const CONSENT_ERROR_CODES = {
  /** `documentVersion` no coincide con la versión vigente del tipo (422). */
  INVALID_VERSION: 'CSNT.VAL.001',
  /** `type`/`audience` fuera del enum permitido, o error de validación genérico (422). */
  INVALID_TYPE: 'CSNT.VAL.002',
  /** No hay versión vigente publicada del tipo solicitado (422) — USRH1784146205513. */
  NO_CURRENT_VERSION: 'CSNT.VAL.003',
  /** Falta el archivo de evidencia del consentimiento físico (422). */
  EVIDENCE_FILE_REQUIRED: 'CSNT.VAL.004',
  /** Tipo de archivo de evidencia inválido (extensión o MIME fuera de la whitelist) (422). */
  EVIDENCE_FILE_INVALID: 'CSNT.VAL.005',
  /** Archivo de evidencia mayor al límite permitido (422). */
  EVIDENCE_FILE_TOO_LARGE: 'CSNT.VAL.006',
  /** El empleado (o su usuario) ya tiene el documento vigente aceptado, por cualquier canal (409). */
  DUPLICATE_CONSENT: 'CSNT.DUP.001',
  /** Empleado inexistente, dado de baja o fuera del scope del usuario (404). */
  EMPLOYEE_NOT_FOUND: 'CSNT.NF.001',
  /** Usuario autenticado sin el permiso `register-physical-consent` (403). */
  FORBIDDEN_PHYSICAL_CONSENT: 'CSNT.FORB.001',
  /** Fallo de S3 al subir el escaneo o al firmar la URL de descarga (500). */
  EVIDENCE_STORAGE_FAILED: 'CSNT.SRV.001',
} as const

export type ConsentErrorCode = (typeof CONSENT_ERROR_CODES)[keyof typeof CONSENT_ERROR_CODES]
