import vine from '@vinejs/vine'
import { compromisoDocumentalSchema } from '#validators/compliance-repse/anexo_15d.validator'
import type { Anexo15dUpdatePayload } from '#services/contrato_servicio_especializado_service'

const addendumAnexo15dSchema = vine.object({
  numeroTrabajadoresAprox: vine.number().min(1).optional(),
  objetoDetallado: vine.string().trim().minLength(20).maxLength(3000).optional(),
  fechaInicioServicio: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }).optional(),
  fechaFinServicio: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }).optional().nullable(),
  compromisosDocumentales: vine.array(compromisoDocumentalSchema).minLength(1).optional(),
  responsabilidadSolidariaAceptada: vine.boolean().optional(),
  textoResponsabilidadSolidaria: vine.string().trim().minLength(50).maxLength(3000).optional(),
})

export const addendumAnexoFieldKeys = [
  'numeroTrabajadoresAprox',
  'objetoDetallado',
  'compromisosDocumentales',
  'fechaInicioServicio',
  'fechaFinServicio',
  'textoResponsabilidadSolidaria',
  'responsabilidadSolidariaAceptada',
] as const satisfies readonly (keyof Anexo15dUpdatePayload)[]

export function hasAtLeastOneAddendableField(anexo: Anexo15dUpdatePayload): boolean {
  return addendumAnexoFieldKeys.some((key) => anexo[key] !== undefined)
}

export const addendarContratoValidator = vine.compile(
  vine.object({
    motivo: vine.string().trim().minLength(3).maxLength(500),
    anexo: addendumAnexo15dSchema,
  })
)
