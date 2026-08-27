/**
 * Constantes de los documentos del expediente de salida (USRH1787433503686).
 * Conjuntos cerrados del slice: `varchar` en BD, literal aquí.
 */

/** Tipos de documento; hoy solo la constancia de separación. */
export const EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE = {
  SEPARATION_LETTER: 'separation_letter',
} as const

export type EmployeeOffboardingDocumentType =
  (typeof EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE)[keyof typeof EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE]

/** De dónde salió la fecha de separación impresa. H1a siempre `terminated`. */
export const REFERENCE_DATE_SOURCE = {
  TERMINATED: 'terminated',
  PLANNED: 'planned',
} as const

/** Carpeta lógica en S3 bajo `AWS_ROOT_PATH/files/`. */
export const DOCUMENTS_S3_FOLDER = 'employee-offboarding-documents'

/** Vigencia (segundos) de la URL firmada: 5 min. NO negociable hacia arriba. */
export const DOCUMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60

/**
 * Invariante del slice: el documento es SIEMPRE PDF. No se guarda como
 * columna ni se expone en el contrato.
 */
export const DOCUMENT_MIME_TYPE = 'application/pdf'

/** Anchos de las columnas de snapshot (espejo de las tablas de origen). */
export const DOCUMENT_EMPLOYEE_NAME_MAX_LENGTH = 255
export const DOCUMENT_POSITION_NAME_MAX_LENGTH = 100
export const DOCUMENT_DEPARTMENT_NAME_MAX_LENGTH = 100
export const DOCUMENT_LEGAL_NAME_MAX_LENGTH = 250
