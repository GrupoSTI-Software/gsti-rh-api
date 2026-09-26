import vine from '@vinejs/vine'
import { REPSE_EXPEDIENTE_DOCUMENTO_TIPOS } from '../expediente.constants.js'

export const createRepseExpedienteDocumentoValidator = vine.compile(
  vine.object({
    tipo: vine.enum(REPSE_EXPEDIENTE_DOCUMENTO_TIPOS),
    anio: vine.number().min(2000).max(2100),
    mes: vine.number().min(1).max(12).optional(),
    cuatrimestre: vine.number().min(1).max(3).optional(),
    fechaDocumento: vine
      .date({ formats: ['YYYY-MM-DD', 'ISO8601'] })
      .optional(),
  })
)

export const listRepseExpedienteDocumentosValidator = vine.compile(
  vine.object({
    tipo: vine.enum(REPSE_EXPEDIENTE_DOCUMENTO_TIPOS).optional(),
    anio: vine.number().min(2000).max(2100).optional(),
    mes: vine.number().min(1).max(12).optional(),
    cuatrimestre: vine.number().min(1).max(3).optional(),
    page: vine.number().min(1),
    limit: vine.number().min(1).max(100),
  })
)
