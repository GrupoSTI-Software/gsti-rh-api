import vine from '@vinejs/vine'

const MAX_BATCH = 500

const employeeParams = vine.object({ employeeId: vine.number().withoutDecimals().min(1) })

export const employeeAccessParamsValidator = vine.compile(vine.object({ params: employeeParams }))

export const employeeAccessItemParamsValidator = vine.compile(
  vine.object({
    params: vine.object({
      employeeId: vine.number().withoutDecimals().min(1),
      userResponsibleEmployeeId: vine.number().withoutDecimals().min(1),
    }),
  })
)

export const addConsultedByValidator = vine.compile(
  vine.object({
    params: employeeParams,
    userIds: vine.array(vine.number().withoutDecimals().min(1)).minLength(1).maxLength(MAX_BATCH),
  })
)

export const addCanConsultValidator = vine.compile(
  vine.object({
    params: employeeParams,
    employeeIds: vine
      .array(vine.number().withoutDecimals().min(1))
      .minLength(1)
      .maxLength(MAX_BATCH),
  })
)

export const directBossValidator = vine.compile(
  vine.object({
    params: vine.object({
      employeeId: vine.number().withoutDecimals().min(1),
      userResponsibleEmployeeId: vine.number().withoutDecimals().min(1),
    }),
    directBoss: vine.boolean(),
    /** Confirma reemplazar la jefatura directa que ya tiene el colaborador. */
    replace: vine.boolean().optional(),
  })
)
