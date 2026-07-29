import vine from '@vinejs/vine'
import { rfcSatField } from '../../shared/validators/rfc.validator.js'

const positiveIdField = vine.number().min(1)

/**
 * Validadores del catálogo de empresas contratantes.
 *
 * `businessUnitId` se valida como entero interno porque el middleware
 * `businessScope` ya resolvió el UUID v4 (header / query / body) al ID
 * numérico antes de llegar al controller.
 */
export const createEmpresaContratanteValidator = vine.compile(
  vine.object({
    businessUnitId: positiveIdField,
    razonSocial: vine.string().trim().minLength(3).maxLength(255),
    rfc: rfcSatField,
    domicilioFiscal: vine.string().trim().minLength(10).maxLength(500),
    representanteLegal: vine.string().trim().maxLength(255).optional().nullable(),
    correo: vine.string().trim().email().maxLength(255).optional().nullable(),
    telefono: vine.string().trim().minLength(10).maxLength(20).optional().nullable(),
  })
)

export const listEmpresasContratantesValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(500).optional(),
    q: vine.string().trim().maxLength(255).optional(),
    businessUnitId: positiveIdField.optional(),
  })
)

export const updateEmpresaContratanteValidator = vine.compile(
  vine.object({
    razonSocial: vine.string().trim().minLength(3).maxLength(255).optional(),
    rfc: rfcSatField.optional(),
    domicilioFiscal: vine.string().trim().minLength(10).maxLength(500).optional(),
    representanteLegal: vine.string().trim().maxLength(255).optional().nullable(),
    correo: vine.string().trim().email().maxLength(255).optional().nullable(),
    telefono: vine.string().trim().minLength(10).maxLength(20).optional().nullable(),
  })
)
