import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Usuario vivo de una empresa, reducido a lo que un aviso puede usar.
 * El correo ya viene recortado; vacío no sale de la consulta.
 */
export interface TenantUserWithPermission {
  userId: number
  email: string
}

/**
 * Igual que el anterior, más el rol efectivo con el que entró a la empresa.
 * `email` puede ser null solo si el llamador pide no filtrarlo; esta consulta
 * no devuelve correos vacíos.
 */
export interface TenantUserByRoleSlug {
  userId: number
  email: string | null
  roleId: number
  roleSlug: string
}

/** Parámetros de la variante por permiso de módulo. */
export interface TenantUsersWithModulePermissionParams {
  businessUnitId: number
  moduleSlug: string
  permissionSlug: string
}

/** Parámetros de la variante por slug de rol efectivo. */
export interface TenantUsersByEffectiveRoleSlugsParams {
  businessUnitId: number
  roleSlugs: string[]
}

interface PermissionRow {
  user_id: number
  user_email?: string | null
  email?: string | null
}

interface RoleSlugRow {
  user_id: number
  user_email?: string | null
  email?: string | null
  role_id: number
  role_slug: string
}

const EXCLUDED_ROLE_SLUGS = ['root', 'owner'] as const

/**
 * Usuarios con acceso vigente a una empresa y un permiso de módulo en el rol
 * efectivo de esa empresa.
 *
 * Falla cerrada: empresa inválida, slugs vacíos, módulo inactivo, permiso o
 * concesión dados de baja y rol root u owner devuelven vacío. No lee el
 * interruptor de exigencia del módulo. Si la pivote apunta a un rol borrado,
 * no cae al rol de la cuenta.
 *
 * @param params Empresa, módulo y acción.
 * @param trx Transacción opcional. Sin ella usa la conexión normal.
 */
export async function fetchTenantUsersWithModulePermission(
  params: TenantUsersWithModulePermissionParams,
  trx?: TransactionClientContract
): Promise<TenantUserWithPermission[]> {
  const moduleSlug = params.moduleSlug.trim()
  const permissionSlug = params.permissionSlug.trim()
  if (!isUsableBusinessUnitId(params.businessUnitId) || moduleSlug === '' || permissionSlug === '') {
    return []
  }

  const connection = trx ?? db
  const rows = (await baseQuery(connection, params.businessUnitId)
    .innerJoin('role_system_permissions as rsp', (join) => {
      join.on('rsp.role_id', 'r.role_id').andOnNull('rsp.role_system_permission_deleted_at')
    })
    .innerJoin('system_permissions as sp', (join) => {
      join
        .on('sp.system_permission_id', 'rsp.system_permission_id')
        .andOnNull('sp.system_permission_deleted_at')
    })
    .innerJoin('system_modules as sm', (join) => {
      join.on('sm.system_module_id', 'sp.system_module_id').andOnNull('sm.system_module_deleted_at')
    })
    .where('sm.system_module_active', 1)
    .where('sm.system_module_slug', moduleSlug)
    .where('sp.system_permission_slug', permissionSlug)
    .distinct('u.user_id', 'u.user_email')) as PermissionRow[]

  return rows
    .map((row) => ({ userId: Number(row.user_id), email: readEmail(row) }))
    .filter((row) => row.email !== '')
    .sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()) || a.userId - b.userId)
}

/**
 * Usuarios con acceso vigente a una empresa cuyo rol efectivo tiene uno de
 * los slugs pedidos. Mismas exclusiones que la variante por permiso: root,
 * owner, rol de otra empresa y pivote con rol borrado quedan fuera.
 *
 * @param params Empresa y slugs de rol.
 * @param trx Transacción opcional.
 */
export async function fetchTenantUsersByEffectiveRoleSlugs(
  params: TenantUsersByEffectiveRoleSlugsParams,
  trx?: TransactionClientContract
): Promise<TenantUserByRoleSlug[]> {
  const roleSlugs = params.roleSlugs.map((slug) => slug.trim().toLowerCase()).filter((slug) => slug !== '')
  if (!isUsableBusinessUnitId(params.businessUnitId) || roleSlugs.length === 0) {
    return []
  }

  const connection = trx ?? db
  const placeholders = roleSlugs.map(() => '?').join(', ')
  const rows = (await baseQuery(connection, params.businessUnitId)
    .whereRaw(`LOWER(TRIM(r.role_slug)) IN (${placeholders})`, roleSlugs)
    .distinct('u.user_id', 'u.user_email', 'r.role_id', 'r.role_slug')) as RoleSlugRow[]

  return rows
    .map((row) => ({
      userId: Number(row.user_id),
      email: readEmail(row) || null,
      roleId: Number(row.role_id),
      roleSlug: String(row.role_slug),
    }))
    .filter((row) => row.email !== null && row.email !== '')
    .sort((a, b) => (a.email ?? '').toLowerCase().localeCompare((b.email ?? '').toLowerCase()))
}

/** La columna real es `user_email`; `email` solo si alguien aliasa el select. */
function readEmail(row: { email?: string | null; user_email?: string | null }): string {
  const value = row.email ?? row.user_email
  return value === null || value === undefined ? '' : String(value).trim()
}

/** Empresa usable: entero positivo. Cero, negativo y NaN no consultan. */
function isUsableBusinessUnitId(businessUnitId: number): boolean {
  return Number.isInteger(businessUnitId) && businessUnitId > 0
}

/**
 * Usuarios activos de la empresa, con el rol efectivo de esa empresa o común,
 * sin root ni owner.
 */
function baseQuery(connection: TransactionClientContract | typeof db, businessUnitId: number) {
  return connection
    .from('users as u')
    .innerJoin('business_unit_users as buu', (join) => {
      join
        .on('buu.user_id', 'u.user_id')
        .andOnVal('buu.business_unit_id', businessUnitId)
        .andOnNull('buu.business_unit_user_deleted_at')
    })
    .innerJoin('business_units as bu', (join) => {
      join
        .on('bu.business_unit_id', 'buu.business_unit_id')
        .andOnNull('bu.business_unit_deleted_at')
    })
    .joinRaw(
      'inner join `roles` as `r` on `r`.`role_id` = COALESCE(`buu`.`role_id`, `u`.`role_id`) and `r`.`role_deleted_at` is null'
    )
    .where('bu.business_unit_active', 1)
    .whereNull('u.user_deleted_at')
    .where('u.user_active', 1)
    .whereNotNull('u.user_email')
    .whereRaw("TRIM(u.user_email) <> ''")
    .where('r.role_active', 1)
    .where((query) => {
      query.where('r.business_unit_id', businessUnitId).orWhereNull('r.business_unit_id')
    })
    .whereNotIn('r.role_slug', [...EXCLUDED_ROLE_SLUGS])
}

/** Empresas de un aviso. Se descartan repetidas y las que no son entero positivo. */
export interface TenantHumanCapitalQuery {
  businessUnitIds: readonly number[]
}

/**
 * Usuario cuyo rol efectivo en una empresa está marcado como Recursos Humanos.
 * Una fila por usuario y empresa. El correo puede venir vacío: quien avisa decide si lo descarta.
 */
export interface TenantHumanCapitalUser extends TenantUserByRoleSlug {
  businessUnitId: number
}

interface HumanCapitalRow {
  user_id?: number
  userId?: number
  email?: string | null
  user_email?: string | null
  role_id?: number
  roleId?: number
  role_slug?: string
  roleSlug?: string
}

/**
 * Usuarios vivos cuyo rol efectivo en cada empresa está marcado como Recursos Humanos.
 *
 * Sirve solo para avisos que no tienen un módulo con permisos. La marca no
 * sustituye un permiso. Una fila por usuario y empresa. No descarta el correo
 * por su cuenta: si llega vacío, sale con email null.
 * Sin empresas válidas no consulta. Recorre las empresas en serie para poder
 * usarse dentro de una transacción.
 *
 * @param query Empresas del aviso.
 * @param trx Transacción opcional. Sin ella usa la conexión normal.
 */
export async function fetchTenantHumanCapitalUsers(
  query: TenantHumanCapitalQuery,
  trx?: TransactionClientContract
): Promise<TenantHumanCapitalUser[]> {
  const businessUnitIds = [...new Set(query.businessUnitIds)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b)
  if (businessUnitIds.length === 0) return []

  const client = trx ?? db
  const recipients: TenantHumanCapitalUser[] = []

  for (const businessUnitId of businessUnitIds) {
    const rows = (await baseQuery(client, businessUnitId)
      .where('r.role_human_capital', 1)
      .select(
        'u.user_id',
        client.raw("NULLIF(TRIM(u.user_email), '') as email"),
        'r.role_id',
        'r.role_slug'
      )
      .distinct()
      .orderBy('u.user_id', 'asc')) as HumanCapitalRow[]

    for (const row of rows) {
      recipients.push({
        userId: Number(row.user_id ?? row.userId),
        email: emptyEmailToNull(row),
        roleId: Number(row.role_id ?? row.roleId),
        roleSlug: String(row.role_slug ?? row.roleSlug),
        businessUnitId,
      })
    }
  }

  return recipients
}

/** El alias `email` trae el correo recortado; vacío queda en null. */
function emptyEmailToNull(row: HumanCapitalRow): string | null {
  const value = row.email ?? row.user_email
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}
