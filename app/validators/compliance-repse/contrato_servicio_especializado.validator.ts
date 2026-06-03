import vine from '@vinejs/vine'
import { anexo15dSchema } from './anexo_15d.validator.js'

const positiveIdField = vine.number().min(1)

const estatusField = vine.enum(['borrador', 'vigente', 'vencido', 'cancelado'])

export const createContratoServicioEspecializadoValidator = vine.compile(
  vine.object({
    empresaContratanteId: positiveIdField,
    numeroContrato: vine.string().trim().minLength(1).maxLength(50),
    fechaInicio: vine.date({ formats: ['YYYY-MM-DD'] }),
    fechaFin: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
    objetoServicio: vine.string().trim().minLength(10).maxLength(2000),
    montoTotal: vine.number().min(0).decimal([0, 2]).optional().nullable(),
    moneda: vine.string().trim().fixedLength(3).optional(),
    estatus: estatusField.optional(),
    anexo15d: anexo15dSchema,
  })
)

export const updateContratoServicioEspecializadoValidator = vine.compile(
  vine.object({
    numeroContrato: vine.string().trim().minLength(1).maxLength(50).optional(),
    fechaInicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    fechaFin: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
    objetoServicio: vine.string().trim().minLength(10).maxLength(2000).optional(),
    montoTotal: vine.number().min(0).decimal([0, 2]).optional().nullable(),
    moneda: vine.string().trim().fixedLength(3).optional(),
    estatus: estatusField.optional(),
    anexo15d: vine
      .object({
        objetoDetallado: vine.string().trim().minLength(20).maxLength(3000).optional(),
        numeroTrabajadoresAprox: vine.number().min(1).optional(),
        fechaInicioServicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
        fechaFinServicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
        compromisosDocumentales: vine
          .array(
            vine.object({
              tipo: vine.enum([
                'cfdi_nomina',
                'comprobante_imss',
                'comprobante_infonavit',
                'otro',
              ]),
              descripcion: vine.string().trim().minLength(1).maxLength(500),
              periodicidad: vine.enum([
                'mensual',
                'bimestral',
                'cuatrimestral',
                'anual',
                'por_evento',
              ]),
            })
          )
          .minLength(1)
          .optional(),
        responsabilidadSolidariaAceptada: vine.boolean().optional(),
        textoResponsabilidadSolidaria: vine
          .string()
          .trim()
          .minLength(50)
          .maxLength(3000)
          .optional(),
      })
      .optional(),
  })
)

export const listContratosServiciosEspecializadosValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(500).optional(),
    estatus: vine.array(estatusField).minLength(1).optional(),
    empresaContratanteId: positiveIdField.optional(),
    fechaInicioDesde: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    fechaInicioHasta: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    q: vine.string().trim().maxLength(255).optional(),
  })
)
