import vine from '@vinejs/vine'

export const createBranchOfficeValidator = vine.compile(
  vine.object({
    /** Opcional: sin el, el alta toma la empresa activa de la sesion. */
    businessUnitId: vine.number().positive().optional(),
    branchOfficeName: vine.string().trim().minLength(1).maxLength(255),
    /** Domicilio de la sucursal: todo opcional. Sirve para los documentos del
     *  personal asignado, pero no identifica a la sucursal ni condiciona su
     *  operacion, asi que puede completarse despues del alta. */
    branchOfficeStreet: vine.string().trim().maxLength(255).optional().nullable(),
    branchOfficeSettlement: vine.string().trim().maxLength(150).optional().nullable(),
    branchOfficeZipcode: vine.string().trim().maxLength(10).optional().nullable(),
    branchOfficeCity: vine.string().trim().maxLength(150).optional().nullable(),
    branchOfficeState: vine.string().trim().maxLength(150).optional().nullable(),
    /** Zona IANA del sitio (p. ej. America/Ciudad_Juarez); nula hereda la de la empresa. */
    branchOfficeTimezone: vine.string().trim().maxLength(64).optional().nullable(),
    /** GeoJSON serializado como string (p. ej. FeatureCollection) o texto libre; sin límite Vine — columna LONGTEXT */
    branchOfficeLocationAddress: vine.string().trim().optional().nullable(),
    branchOfficeIdealTemplateCount: vine.number().min(0).optional().nullable(),
    branchOfficeMinActiveEmployeesPerShift: vine.number().min(0).optional().nullable(),
    /** Empresa contratante ligada (sitio de servicio REPSE); null explícito no aplica en alta */
    empresaContratanteId: vine.number().positive().optional().nullable(),
    /** Marca la sucursal como principal de la empresa, quitándosela a la que la tenga */
    branchOfficeIsDefault: vine.boolean().optional(),
  })
)

export const updateBranchOfficeValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive().optional(),
    branchOfficeName: vine.string().trim().minLength(1).maxLength(255).optional(),
    /** Domicilio: cada campo se puede escribir, dejar como esta o limpiar. */
    branchOfficeStreet: vine.string().trim().maxLength(255).optional().nullable(),
    branchOfficeSettlement: vine.string().trim().maxLength(150).optional().nullable(),
    branchOfficeZipcode: vine.string().trim().maxLength(10).optional().nullable(),
    branchOfficeCity: vine.string().trim().maxLength(150).optional().nullable(),
    branchOfficeState: vine.string().trim().maxLength(150).optional().nullable(),
    /** Zona IANA del sitio (p. ej. America/Ciudad_Juarez); nula hereda la de la empresa. */
    branchOfficeTimezone: vine.string().trim().maxLength(64).optional().nullable(),
    /** GeoJSON serializado como string (p. ej. FeatureCollection) o texto libre; sin límite Vine — columna LONGTEXT */
    branchOfficeLocationAddress: vine.string().trim().optional().nullable(),
    branchOfficeIdealTemplateCount: vine.number().min(0).optional().nullable(),
    branchOfficeMinActiveEmployeesPerShift: vine.number().min(0).optional().nullable(),
    /** Empresa contratante ligada; null desliga la sucursal como sitio de servicio */
    empresaContratanteId: vine.number().positive().optional().nullable(),
    /** true transfiere la marca de sucursal principal; false sobre la principal se rechaza */
    branchOfficeIsDefault: vine.boolean().optional(),
  })
)

/**
 * Borrado de sucursal: si tiene empleados activos, el destino al que se
 * trasladan es obligatorio y viaja en el query string.
 */
export const deleteBranchOfficeValidator = vine.compile(
  vine.object({
    targetBranchOfficeId: vine.number().positive().optional(),
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
