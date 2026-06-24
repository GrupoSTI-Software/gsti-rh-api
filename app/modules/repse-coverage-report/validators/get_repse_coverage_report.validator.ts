import vine from '@vinejs/vine'

const positiveIdField = vine.number().min(1)
const isoDateField = vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)

export const getRepseCoverageReportValidator = vine.compile(
  vine.object({
    from: isoDateField,
    to: isoDateField,
    companyId: positiveIdField.optional(),
    employeeId: positiveIdField.optional(),
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(500).optional(),
  })
)

export const getRepseCoverageReportExportValidator = vine.compile(
  vine.object({
    from: isoDateField,
    to: isoDateField,
    companyId: positiveIdField.optional(),
    employeeId: positiveIdField.optional(),
    format: vine.string().trim().in(['xlsx']).optional(),
  })
)
