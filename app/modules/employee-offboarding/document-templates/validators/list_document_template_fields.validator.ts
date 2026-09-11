import vine from '@vinejs/vine'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '../../documents/documents.constants.js'

/**
 * Query del catálogo de campos combinables (USRH1788579938623): solo el tipo
 * de documento, opcional. El `enum` cierra sobre la constante del slice
 * `documents/`: el día que ESB-05-07-04 ensanche la unión, el nuevo tipo
 * entra aquí sin tocar nada. Fuera del conjunto → 400 `datos-invalidos`.
 */
export const listDocumentTemplateFieldsValidator = vine.compile(
  vine.object({
    documentType: vine.enum(Object.values(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE)).optional(),
  })
)
