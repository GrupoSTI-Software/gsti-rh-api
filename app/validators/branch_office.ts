import vine from '@vinejs/vine'

export const createBranchOfficeValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive(),
    branchOfficeName: vine.string().trim().minLength(1).maxLength(255),
    /** GeoJSON serializado como string (p. ej. FeatureCollection) o texto libre; sin límite Vine — columna LONGTEXT */
    branchOfficeLocationAddress: vine.string().trim().optional().nullable(),
    branchOfficeIdealTemplateCount: vine.number().min(0).optional().nullable(),
    branchOfficeMinActiveEmployeesPerShift: vine.number().min(0).optional().nullable(),
    /** Empresa contratante ligada (sitio de servicio REPSE); null explícito no aplica en alta */
    empresaContratanteId: vine.number().positive().optional().nullable(),
  })
)

export const updateBranchOfficeValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive().optional(),
    branchOfficeName: vine.string().trim().minLength(1).maxLength(255).optional(),
    /** GeoJSON serializado como string (p. ej. FeatureCollection) o texto libre; sin límite Vine — columna LONGTEXT */
    branchOfficeLocationAddress: vine.string().trim().optional().nullable(),
    branchOfficeIdealTemplateCount: vine.number().min(0).optional().nullable(),
    branchOfficeMinActiveEmployeesPerShift: vine.number().min(0).optional().nullable(),
    /** Empresa contratante ligada; null desliga la sucursal como sitio de servicio */
    empresaContratanteId: vine.number().positive().optional().nullable(),
  })
)

export const branchOfficeFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    businessUnitId: vine.number().positive().optional(),
    branchOfficeName: vine.string().trim().optional(),
    empresaContratanteId: vine.number().positive().optional(),
    sortOrder: vine.enum(['asc', 'desc']).optional(),
    includeDeleted: vine.boolean().optional(),
  })
)
