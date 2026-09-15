import type { Assert } from '@japa/assert'
import type { ApiResponse } from '@japa/api-client'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'

/**
 * Actores explícitos para specs de `permissionGate` sobre una BD limpia.
 *
 * Por qué existe: varios specs tomaban usuarios, unidades e ids de una BD de
 * desarrollo ("el usuario de sae", "el turno 122"). En una BD recién sembrada
 * esos datos no existen y el spec fallaba en el setup; y con la exigencia del
 * módulo encendida, un usuario cuyo rol no se conoce responde 403 antes de
 * llegar a lo que el caso quería probar.
 *
 * Contrato:
 *  - `createTenantActor` crea su propia unidad de negocio y un rol sin
 *    salvoconducto. Ese rol empieza sin concesiones: cada caso siembra solo
 *    las que necesita con `grantModulePermissions`.
 *  - `createBypassActor` usa un rol global por slug (`owner`, `root`, ...) vía
 *    `ensureRole`. Ese rol se comparte entre specs, así que nunca se le quitan
 *    ni se le dan concesiones.
 *  - `cleanupTenantActor` borra lo que el actor creó; el rol solo si es suyo.
 */

const HELPER_NAME = 'tests/helpers/tenant_actor'
const TEST_PASSWORD = 'TenantActorGate123!'

export interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
  /** El rol nació para el spec: se le pueden sembrar concesiones y se borra al limpiar. */
  ownsRole: boolean
}

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Nombre único por corrida, para no chocar con validaciones de nombre repetido. */
export const uniqueTestName = (prefix: string) => `${prefix} ${uniqueStamp()}`

async function createActorWithRole(
  prefix: string,
  role: Role,
  ownsRole: boolean
): Promise<TenantActor> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Gate ${prefix} ${stamp}`,
    businessUnitSlug: `gate-${prefix}-${stamp}`,
    businessUnitLegalName: `Gate ${prefix} legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const person = await Person.create({
    personFirstname: 'Gate',
    personLastname: 'Test',
    personSecondLastname: prefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit, role, ownsRole }
}

/** Usuario con unidad propia y un rol sin salvoconducto ni concesiones. */
export async function createTenantActor(prefix: string): Promise<TenantActor> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Gate ${prefix} ${stamp}`,
    roleSlug: `gate-${prefix}-${stamp}`,
    roleDescription: 'Rol temporal de spec: solo tiene las concesiones que siembra cada caso',
    roleActive: 1,
    roleBusinessAccess: 'gsti-rh',
    roleManagementDays: 10,
  })

  return createActorWithRole(prefix, role, true)
}

/** Usuario con unidad propia y un rol global que el gate reconoce por slug. */
export async function createBypassActor(roleSlug: TestRoleSlug, prefix: string): Promise<TenantActor> {
  return createActorWithRole(prefix, await ensureRole(roleSlug), false)
}

export async function cleanupTenantActor(actor: TenantActor | null): Promise<void> {
  if (!actor) return

  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  if (actor.ownsRole) {
    await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
    await Role.query().where('role_id', actor.role.roleId).delete()
  }
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

/**
 * Deja al rol del actor con exactamente estas concesiones del módulo (lista
 * vacía = ninguna). Reemplaza en lugar de sumar para que cada paso de un caso
 * pruebe un solo permiso.
 *
 * @throws Error si el rol no es del spec o si el permiso no está sembrado.
 */
export async function grantModulePermissions(
  actor: TenantActor,
  moduleSlug: string,
  permissionSlugs: readonly string[]
): Promise<void> {
  if (!actor.ownsRole) {
    throw new Error(
      `[${HELPER_NAME}] El rol "${actor.role.roleSlug}" es compartido: no se le siembran concesiones.`
    )
  }

  await grantRoleModulePermissions(actor.role, moduleSlug, permissionSlugs)
}

/**
 * Igual que `grantModulePermissions`, pero sobre un rol que el spec creó por
 * su cuenta: los specs de aislamiento arman actores con varias empresas y no
 * pasan por `createTenantActor`. Reemplaza TODAS las concesiones del rol, así
 * que nunca se usa con un rol global (`owner`, `root`, ...).
 *
 * @throws Error si el permiso no está sembrado.
 */
export async function grantRoleModulePermissions(
  role: Role,
  moduleSlug: string,
  permissionSlugs: readonly string[]
): Promise<void> {
  await RoleSystemPermission.query().where('role_id', role.roleId).delete()
  for (const permissionSlug of permissionSlugs) {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', permissionSlug)
      .whereHas('systemModule', (query) =>
        query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
      )
      .first()

    if (!permission) {
      throw new Error(
        `[${HELPER_NAME}] No existe el permiso "${moduleSlug}:${permissionSlug}": corre "migration:fresh --seed".`
      )
    }

    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }
}

/**
 * El gate lee la exigencia de la BD, no de la constante: sin re-sembrar, un
 * módulo recién encendido sigue dejando pasar a todos y el spec mentiría.
 *
 * @throws Error si el módulo no existe o tiene la exigencia apagada en BD.
 */
export async function assertModuleEnforced(moduleSlug: string): Promise<void> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', moduleSlug)
    .first()

  if (!systemModule?.systemModulePermissionEnforcementActive) {
    throw new Error(
      `[${HELPER_NAME}] "${moduleSlug}" no tiene la exigencia encendida en BD: corre "migration:fresh --seed".`
    )
  }
}

/**
 * Fija la exigencia del módulo en BD y devuelve la que tenía, para restaurarla
 * en el teardown del grupo.
 *
 * Existe porque varios specs de Empleados (p. ej. `employee_photo_me.spec.ts`)
 * apagan esa exigencia para probar el soft-rollout y no la vuelven a encender.
 * Un spec posterior que la necesita no puede fiarse de la siembra: la enciende
 * él mismo y deja al terminar el valor que encontró.
 *
 * @throws Error si el módulo no existe en BD.
 */
export async function setModuleEnforcement(moduleSlug: string, active: boolean): Promise<boolean> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', moduleSlug)
    .first()

  if (!systemModule) {
    throw new Error(`[${HELPER_NAME}] No existe el módulo "${moduleSlug}": corre "migration:fresh --seed".`)
  }

  const previous = Boolean(systemModule.systemModulePermissionEnforcementActive)
  systemModule.systemModulePermissionEnforcementActive = active
  await systemModule.save()
  return previous
}

export const businessUnitHeaders = (actor: TenantActor) => ({
  'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId,
})

/** Negativa del gate: 403 con la key de denegación, no un 403 de otra capa. */
export function assertPermissionDenied(assert: Assert, response: ApiResponse): void {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED)
}

/**
 * La petición cruzó el gate: lo que responda el controller (p. ej. 400 por
 * falta de archivo) ya no es asunto del permiso.
 */
export function assertPassesGate(assert: Assert, response: ApiResponse): void {
  assert.notEqual(response.status(), 403)
  assert.isBelow(response.status(), 500)
}

/** Valor de setup obligatorio: si falta, el caso no puede probar nada. */
export function required<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[${HELPER_NAME}] Falta ${name}: revisa el setup del grupo.`)
  }
  return value
}
