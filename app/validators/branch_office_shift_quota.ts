import vine from '@vinejs/vine'

const positiveIdField = vine.number().min(1)

const shiftQuotaItemSchema = vine.object({
  shiftId: positiveIdField,
  required: vine.number().min(1),
  minimum: vine.number().min(1),
})

export const replaceBranchOfficeShiftQuotasValidator = vine.compile(
  vine.object({
    quotas: vine.array(shiftQuotaItemSchema).optional(),
  })
)

export type BranchOfficeShiftQuotaInput = {
  shiftId: number
  required: number
  minimum: number
}

/**
 * Detecta shiftId repetidos en el payload e identifica los índices (1-based).
 */
export function findDuplicateShiftIndices(
  quotas: BranchOfficeShiftQuotaInput[]
): number[] {
  const seen = new Map<number, number>()
  const duplicates: number[] = []

  quotas.forEach((item, index) => {
    const itemIndex = index + 1
    if (seen.has(item.shiftId)) {
      duplicates.push(seen.get(item.shiftId)!)
      duplicates.push(itemIndex)
    } else {
      seen.set(item.shiftId, itemIndex)
    }
  })

  return [...new Set(duplicates)].sort((a, b) => a - b)
}
