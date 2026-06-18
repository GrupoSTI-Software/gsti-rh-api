import vine from '@vinejs/vine'

const compromisoDocumentalTipo = vine.enum([
  'cfdi_nomina',
  'comprobante_imss',
  'comprobante_infonavit',
  'otro',
])

const compromisoDocumentalPeriodicidad = vine.enum([
  'mensual',
  'bimestral',
  'cuatrimestral',
  'anual',
  'por_evento',
])

export const compromisoDocumentalSchema = vine.object({
  tipo: compromisoDocumentalTipo,
  descripcion: vine.string().trim().minLength(1).maxLength(500),
  periodicidad: compromisoDocumentalPeriodicidad,
})

/** Sub-validator reutilizable del anexo 15-D LFT. No incluye folioRepse (autocompletado server-side). */
export const anexo15dSchema = vine.object({
  objetoDetallado: vine.string().trim().minLength(20).maxLength(3000),
  numeroTrabajadoresAprox: vine.number().min(1),
  fechaInicioServicio: vine.date({ formats: ['YYYY-MM-DD'] }),
  fechaFinServicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
  compromisosDocumentales: vine.array(compromisoDocumentalSchema).minLength(1),
  responsabilidadSolidariaAceptada: vine.boolean().optional(),
  textoResponsabilidadSolidaria: vine.string().trim().minLength(50).maxLength(3000),
})

export const createAnexo15dValidator = vine.compile(anexo15dSchema)

export const updateAnexo15dValidator = vine.compile(
  vine.object({
    objetoDetallado: vine.string().trim().minLength(20).maxLength(3000).optional(),
    numeroTrabajadoresAprox: vine.number().min(1).optional(),
    fechaInicioServicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    fechaFinServicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
    compromisosDocumentales: vine.array(compromisoDocumentalSchema).minLength(1).optional(),
    responsabilidadSolidariaAceptada: vine.boolean().optional(),
    textoResponsabilidadSolidaria: vine.string().trim().minLength(50).maxLength(3000).optional(),
  })
)
