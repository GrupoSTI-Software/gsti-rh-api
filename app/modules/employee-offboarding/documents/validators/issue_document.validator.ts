import vine from '@vinejs/vine'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPES } from '../documents.constants.js'

/**
 * Emisión de un documento del expediente (USRH1787433503686). `documentType`
 * es obligatorio a propósito: con el convenio de terminación
 * (USRH1789097550394) el contrato no cambió, solo se ensanchó el conjunto,
 * que cierra sobre la constante del slice. El `:offboardingId` se parsea en
 * el controller.
 */
export const issueOffboardingDocumentValidator = vine.compile(
  vine.object({
    documentType: vine.enum(EMPLOYEE_OFFBOARDING_DOCUMENT_TYPES),
  })
)
