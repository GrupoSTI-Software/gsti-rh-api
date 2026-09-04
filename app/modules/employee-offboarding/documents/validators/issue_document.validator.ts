import vine from '@vinejs/vine'

/**
 * Emisión de un documento del expediente (USRH1787433503686). `documentType`
 * es obligatorio a propósito: cuando llegue el convenio de terminación el
 * contrato no cambia. El `:offboardingId` se parsea en el controller.
 */
export const issueOffboardingDocumentValidator = vine.compile(
  vine.object({
    documentType: vine.enum(['separation_letter']),
  })
)
