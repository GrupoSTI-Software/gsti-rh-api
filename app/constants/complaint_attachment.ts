/** Tipos MIME permitidos para adjuntos del buzón (validación por contenido real). */
export const COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES = ['application/pdf'] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3'] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_MIMES = [
  ...COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES,
  ...COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES,
  ...COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES,
] as const

export type ComplaintAttachmentAllowedMime = (typeof COMPLAINT_ATTACHMENT_ALLOWED_MIMES)[number]

/** Tamaño máximo por archivo: 10 MB. */
export const COMPLAINT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Carpeta lógica en S3 bajo `{AWS_ROOT_PATH}/files/...`. */
export const COMPLAINT_ATTACHMENT_S3_FOLDER = 'complaint-attachments'

/** Vigencia de la URL firmada de descarga (5 minutos). */
export const COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
