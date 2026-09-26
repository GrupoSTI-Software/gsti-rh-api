import vine from '@vinejs/vine'

export const renovarContratoValidator = vine.compile(
  vine.object({
    fechaInicio: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }),
    fechaFin: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }),
    motivo: vine.string().trim().minLength(3).maxLength(500),
  })
)

export const obtenerVersionContratoParamsValidator = vine.compile(
  vine.object({
    contratoId: vine.number().positive(),
    numeroVersion: vine.number().positive(),
  })
)

export const contratoIdParamValidator = vine.compile(
  vine.object({
    contratoId: vine.number().positive(),
  })
)
