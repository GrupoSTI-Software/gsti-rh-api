import vine from '@vinejs/vine'

const positiveIdField = vine.number().min(1)

const asignacionItemSchema = vine.object({
  employeeId: positiveIdField,
  fechaInicio: vine.date({ formats: ['YYYY-MM-DD'] }),
  fechaFin: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
  porcentajeTiempo: vine.number().min(0.01).max(100).decimal([0, 2]).optional(),
})

export const createAsignacionesBulkValidator = vine.compile(
  vine.object({
    asignaciones: vine.array(asignacionItemSchema).minLength(1),
  })
)

export const listAsignacionesContratoValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(500).optional(),
    employeeId: positiveIdField.optional(),
    vigentesEn: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
  })
)

export const updateAsignacionContratoValidator = vine.compile(
  vine.object({
    fechaInicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    fechaFin: vine.date({ formats: ['YYYY-MM-DD'] }).optional().nullable(),
    porcentajeTiempo: vine.number().min(0.01).max(100).decimal([0, 2]).optional(),
  })
)

/**
 * Detecta employeeId repetidos en el payload bulk e identifica los índices (1-based).
 */
export function findDuplicateEmployeeIndices(
  asignaciones: Array<{ employeeId: number }>
): number[] {
  const seen = new Map<number, number>()
  const duplicates: number[] = []

  asignaciones.forEach((item, index) => {
    const itemIndex = index + 1
    if (seen.has(item.employeeId)) {
      duplicates.push(seen.get(item.employeeId)!)
      duplicates.push(itemIndex)
    } else {
      seen.set(item.employeeId, itemIndex)
    }
  })

  return [...new Set(duplicates)].sort((a, b) => a - b)
}
