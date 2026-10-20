import vine from '@vinejs/vine'

/**
 * Programación de la baja (USRH1786568279587, regla 2; motivos desde
 * VLRH-H1792172854107): colaborador, fecha de baja en `YYYY-MM-DD`, modalidad
 * y tipo obligatorios, nota opcional. Que la fecha sea un día real y que los
 * motivos estén en el catálogo lo valida el servicio.
 */

/** Datos de la baja comunes a programar y a corregir (VLRH-H1792172854107). */
export const offboardingTerminationFields = {
  plannedDate: vine
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  terminationModality: vine.string().trim().minLength(1).maxLength(120),
  terminationType: vine.string().trim().minLength(1).maxLength(200),
}

export const scheduleOffboardingValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    ...offboardingTerminationFields,
    notes: vine.string().trim().maxLength(1000).optional(),
  })
)
