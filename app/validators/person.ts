import vine from '@vinejs/vine'

export const createPersonValidator = vine.compile(
  vine.object({
    personFirstname: vine.string().trim().minLength(1).maxLength(150),
    personLastname: vine.string().trim().minLength(0).maxLength(150),
    personSecondLastname: vine.string().trim().minLength(0).maxLength(150).optional(),
    personPhone: vine.string().trim().minLength(0).maxLength(45).optional(),
    // PUNTO DE REINTRODUCCIÓN 08-10-04-01: unicidad de email por huella (blind-index)
    personEmail: vine.string().trim().minLength(0).maxLength(200).optional(),
    personGender: vine.string().trim().minLength(0).maxLength(10).optional(),
    // PUNTO DE REINTRODUCCIÓN 08-10-04-01: unicidad de CURP por huella (blind-index)
    personCurp: vine.string().trim().minLength(0).maxLength(45).optional(),
    // PUNTO DE REINTRODUCCIÓN 08-10-04-01: unicidad de RFC por huella (blind-index)
    personRfc: vine.string().trim().minLength(0).maxLength(45).optional(),
    // PUNTO DE REINTRODUCCIÓN 08-10-04-01: unicidad de NSS por huella (blind-index)
    personImssNss: vine.string().trim().minLength(0).maxLength(45).optional(),
  })
)

export const updatePersonValidator = vine.compile(
  vine.object({
    personFirstname: vine.string().trim().minLength(1).maxLength(150),
    personLastname: vine.string().trim().minLength(0).maxLength(150),
    personSecondLastname: vine.string().trim().minLength(0).maxLength(150).optional(),
    personPhone: vine.string().trim().minLength(0).maxLength(45).optional(),
    personEmail: vine.string().trim().minLength(0).maxLength(200).optional(),
    personGender: vine.string().trim().minLength(0).maxLength(10).optional(),
    personCurp: vine.string().trim().minLength(0).maxLength(45).optional(),
    personRfc: vine.string().trim().minLength(0).maxLength(45).optional(),
    personImssNss: vine.string().trim().minLength(0).maxLength(45).optional(),
  })
)
