/**
 * Roles de sistema de la plataforma (USRH1785436961936): visibles y asignables
 * en TODO tenant sin depender de `role_business_access`, y fuera de la edición,
 * eliminación o reasignación de permisos desde los tenants (solo `root`).
 *
 * Lista blanca cerrada — la visibilidad ampliada multi-tenant aplica SOLO a
 * estos slugs, nunca a un comodín. Única representación autoritativa: los
 * consumidores (listados de roles y usuarios, guards del controller) la
 * importan de aquí, no la duplican.
 */
/**
 * Rol global de la plataforma: la cuenta de GSTI, sin empresa dueña
 * (`business_unit_id IS NULL`). Es el único rol que NO se siembra por empresa
 * y el único que sobrevive al retiro de los roles globales.
 */
export const PLATFORM_ROLE_SLUG = 'root' as const

export const SYSTEM_ROLE_SLUGS = ['owner', 'empleado'] as const

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number]

export function isSystemRoleSlug(slug: string | null | undefined): slug is SystemRoleSlug {
  return !!slug && (SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug)
}

/**
 * Slugs de identidad que ningún rol creado o renombrado desde una empresa
 * puede tomar. Es una lista distinta de `SYSTEM_ROLE_SLUGS` porque responde a
 * otra pregunta: aquella decide qué rol se VE en todos los tenants; esta, qué
 * slug le da a su dueño un trato especial en el runtime.
 *
 * El slug de un rol se deriva de su nombre (`RoleService.generateSlug`), y el
 * runtime decide por slug:
 *  - `root`: salvoconducto de plataforma en el gate y en los bloqueos de rol.
 *  - `owner`: salvoconducto `standard` y guardia de facturación.
 *  - `super-administrador`: salvoconducto `expanded` (organigrama), REPSE y
 *    facturación. En una BD nueva esa fila no existe, así que un rol llamado
 *    "Super Administrador" nacería con ese slug y con todo ese acceso.
 *  - `empleado`: rol del alta self-service de colaboradores.
 *
 * Los slugs que solo cambian visibilidad en el backoffice (`rh-manager`,
 * `admin`, ...) no están aquí a propósito: reservarlos es decisión de producto
 * pendiente, no un hueco de escalamiento del API.
 */
export const RESERVED_ROLE_IDENTITY_SLUGS = [
  'root',
  'owner',
  'super-administrador',
  'empleado',
] as const

export type ReservedRoleIdentitySlug = (typeof RESERVED_ROLE_IDENTITY_SLUGS)[number]

export function isReservedRoleIdentitySlug(
  slug: string | null | undefined
): slug is ReservedRoleIdentitySlug {
  return !!slug && (RESERVED_ROLE_IDENTITY_SLUGS as readonly string[]).includes(slug)
}
