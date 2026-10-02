import vine from '@vinejs/vine'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPES } from '../documents.constants.js'

/**
 * Query del listado de documentos (USRH1787433503692): sin
 * `includeSuperseded` solo viaja la vigente; `documentType` acota por tipo.
 * Un valor no booleano cae en la rama VineJS del resolvedor (400
 * datos-invalidos) sin clave i18n propia.
 */
export const listOffboardingDocumentsValidator = vine.compile(
  vine.object({
    documentType: vine.enum(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPES).optional(),
    includeSuperseded: vine.boolean().optional(),
  })
)
