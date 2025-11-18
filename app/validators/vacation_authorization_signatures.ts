import vine from '@vinejs/vine'

// POST /api/vacation-authorizations/authorize (con requestIds y vacationSettingId)
export const authorizeVacationValidator = vine.compile(
  vine.object({
    // signature es un archivo en multipart, se valida via request.file en el controlador.
    // Aquí validamos solamente el arreglo de IDs de exception requests y vacationSettingId.
    requestIds: vine.array(vine.number().min(1)).minLength(1),
    vacationSettingId: vine.number().min(1),
  })
)

// POST /api/vacation-authorizations/sign-shift-exceptions (con shiftExceptionIds)
export const signShiftExceptionsValidator = vine.compile(
  vine.object({
    // signature es un archivo en multipart, se valida via request.file en el controlador.
    // Aquí validamos solamente el arreglo de IDs de shift exceptions.
    shiftExceptionIds: vine.array(vine.number().min(1)).minLength(1),
  })
)

// GET /pending y /authorized ?employeeId=number
export const employeeIdQueryValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1),
  })
)

// GET /shift-exceptions ?employeeId=number&vacationSettingId=number
export const shiftExceptionsQueryValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1),
    vacationSettingId: vine.number().min(1),
  })
)
