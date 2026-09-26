import vine from '@vinejs/vine'

export const documentoContratoVigenciaValidator = vine.compile(
  vine.object({
    fechaInicioVigencia: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }),
    fechaVencimiento: vine.date({ formats: ['YYYY-MM-DD', 'ISO8601'] }),
  })
)
