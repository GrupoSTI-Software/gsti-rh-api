import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/tenant-groups`.
 * La unicidad la valida el servicio, no Vine.
 */
export const createTenantGroupValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(150),
  })
)

/**
 * Body para `PUT /api/platform/tenant-groups/:platformTenantGroupId`.
 * Al menos uno de los dos campos; el servicio rechaza el cuerpo vacío con VAL_INPUT.
 */
export const updateTenantGroupValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(150).optional(),
    activo: vine.boolean().optional(),
  })
)

/**
 * Query params para `GET /api/platform/tenant-groups`.
 */
export const listTenantGroupsValidator = vine.compile(
  vine.object({
    search: vine.string().trim().minLength(1).maxLength(150).optional(),
    incluirInactivos: vine.boolean().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
