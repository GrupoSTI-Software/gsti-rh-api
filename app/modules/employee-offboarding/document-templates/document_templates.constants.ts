import type { FileIntakeProfileName } from '#constants/file_intake'

/**
 * Constantes de las plantillas propias del documento de salida
 * (USRH1788553841100). Conjuntos cerrados del slice: `varchar` en BD,
 * literal aquí. El TIPO de documento no se redeclara: se importa (solo
 * lectura) de `documents/documents.constants.ts`, que este slice no edita.
 */

/**
 * Estado de una versión. Los tres nacen aquí aunque `rejected` lo escriba la
 * ESB-05-07-14: no se altera después una tabla que gobierna documentos legales.
 * `superseded` y `rejected` son terminales; nada regresa a `current`.
 */
export const DOCUMENT_TEMPLATE_STATUS = {
  CURRENT: 'current',
  SUPERSEDED: 'superseded',
  REJECTED: 'rejected',
} as const

export type DocumentTemplateStatus =
  (typeof DOCUMENT_TEMPLATE_STATUS)[keyof typeof DOCUMENT_TEMPLATE_STATUS]

/** Perfil de intake: solo PDF, 10 MB, MIME real por magic bytes y almacenamiento PRIVADO. */
export const DOCUMENT_TEMPLATE_INTAKE_PROFILE: FileIntakeProfileName = 'pdf-document'

/** Carpeta lógica en S3; la key completa la arma `UploadService.fileUpload`. */
export const DOCUMENT_TEMPLATES_S3_FOLDER = 'employee-offboarding-document-templates'

/** Ancho de la columna del nombre original ya saneado. */
export const DOCUMENT_TEMPLATE_ORIGINAL_FILE_NAME_MAX_LENGTH = 255

/** Nombre de respaldo cuando el saneado del nombre original queda vacío. */
export const DOCUMENT_TEMPLATE_FALLBACK_FILE_NAME = 'plantilla.pdf'

/** Paginado del historial de versiones. */
export const DOCUMENT_TEMPLATE_VERSIONS_DEFAULT_LIMIT = 50
export const DOCUMENT_TEMPLATE_VERSIONS_MAX_LIMIT = 100
