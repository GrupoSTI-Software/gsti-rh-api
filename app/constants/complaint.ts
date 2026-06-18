export const COMPLAINT_CATEGORIES = ['violencia-laboral', 'entorno', 'otro'] as const

export const COMPLAINT_STATUSES = ['nuevo', 'en-revision', 'resuelto', 'cerrado'] as const

export const COMPLAINT_INITIAL_STATUS = 'nuevo' as const

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

/** Prefijo del folio público (Buzón de Quejas). */
export const COMPLAINT_FOLIO_PREFIX = 'BQ'

/** Longitud de la passphrase entregada al empleado (solo en la respuesta de alta). */
export const COMPLAINT_PASSPHRASE_LENGTH = 12
