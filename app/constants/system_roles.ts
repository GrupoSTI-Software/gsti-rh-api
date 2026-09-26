/**
 * Rol global de la plataforma: la cuenta de GSTI, sin empresa dueña
 * (`business_unit_id IS NULL`). Es el único rol que NO se siembra por empresa
 * y el único que sobrevive al retiro de los roles globales.
 */
export const PLATFORM_ROLE_SLUG = 'root' as const

/**
 * Slugs de identidad que ningún rol creado o renombrado desde una empresa
 * puede tomar: son los que le dan a su dueño un trato especial en el runtime, o
 * los que la empresa ya estrenó al nacer y no puede duplicar.
 *
 * El slug de un rol se deriva de su nombre (`RoleService.generateSlug`), y el
 * runtime decide por slug:
 *  - `root`: salvoconducto de plataforma en el gate y en los bloqueos de rol.
 *  - `owner`: salvoconducto `standard` y guardia de facturación.
 *  - `super-administrador`: salvoconducto `expanded` (organigrama), REPSE y
 *    facturación. En una BD nueva esa fila no existe, así que un rol llamado
 *    "Super Administrador" nacería con ese slug y con todo ese acceso.
 *  - `empleado`: rol del alta self-service de colaboradores.
 *  - `admin`: administrador que cada empresa estrena al nacer
 *    (`TENANT_PROVISIONED_ROLES`); su fila ya existe y el candado
 *    (empresa, slug) rechazaría una segunda.
 *
 * Los slugs que solo cambian visibilidad en el backoffice (`rh-manager`,
 * `admin`, ...) no están aquí a propósito: reservarlos es decisión de producto
 * pendiente, no un hueco de escalamiento del API.
 */
export const RESERVED_ROLE_IDENTITY_SLUGS = [
  'root',
  'owner',
  'admin',
  'super-administrador',
  'empleado',
] as const

export type ReservedRoleIdentitySlug = (typeof RESERVED_ROLE_IDENTITY_SLUGS)[number]

export function isReservedRoleIdentitySlug(
  slug: string | null | undefined
): slug is ReservedRoleIdentitySlug {
  return !!slug && (RESERVED_ROLE_IDENTITY_SLUGS as readonly string[]).includes(slug)
}
