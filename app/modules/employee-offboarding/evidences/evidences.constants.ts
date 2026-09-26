/**
 * Política de archivo de la evidencia de salida (USRH1786568279593, D-2).
 * Precedente vigente: `traumatic_event_report_evidence_service.ts` (10 MB,
 * PDF/JPG/PNG). El tope de 5 archivos por envío acota el request a 50 MB.
 */

/** Límite de tamaño por archivo: 10 MB. */
export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024

/** De 1 a 5 archivos por envío (regla 2); sin tope acumulado por pendiente. */
export const EVIDENCE_MAX_FILES_PER_BATCH = 5

/** PDF, JPG y PNG (regla 2). */
export const EVIDENCE_ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const

export const EVIDENCE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const

/** Carpeta lógica en S3 bajo `AWS_ROOT_PATH/`. */
export const EVIDENCE_S3_FOLDER = 'employee-offboarding-item-evidences'

/** Vigencia (segundos) de la URL firmada de descarga: 5 min (regla 4). */
export const EVIDENCE_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
