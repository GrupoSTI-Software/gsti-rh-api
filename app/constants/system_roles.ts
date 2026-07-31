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
export const SYSTEM_ROLE_SLUGS = ['owner', 'empleado'] as const

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number]

export function isSystemRoleSlug(slug: string | null | undefined): slug is SystemRoleSlug {
  return !!slug && (SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug)
}
