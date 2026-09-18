import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Role from '#models/role'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import User from '#models/user'
import TenantRoleProvisioningService from '#services/tenant_role_provisioning_service'
import { PLATFORM_ROLE_SLUG } from '#constants/system_roles'
import { isTenantRoleSlug } from '#constants/tenant_provisioned_roles'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * A qué rol va una membresía sin rol escrito. Se distingue el rol ajeno del
 * homónimo faltante porque piden cosas distintas: el primero es una decisión
 * humana, el segundo suele ser una siembra pendiente.
 */
type TargetRoleResolution =
  | { kind: 'role'; role: Role }
  | { kind: 'foreign' }
  | { kind: 'missingHomonym'; slug: string }

/**
 * Lleva los entornos con datos al modelo de roles por empresa.
 *
 * Tres pasos, en este orden y no en otro:
 *
 *  1. ADOPTAR. Los roles heredados —los que hoy viven con `business_unit_id`
 *     NULL y se distinguen por el CSV `role_business_access`— pasan a tener
 *     empresa dueña. El que nombra una sola empresa se muda; el que nombra
 *     varias se CLONA, una copia por empresa con sus permisos y departamentos,
 *     porque un rol no puede tener dos dueños y ninguna de esas empresas puede
 *     perder el acceso que ya tenía.
 *  2. SEMBRAR. Cada empresa viva estrena el juego propio que le falte (dueño,
 *     administrador, colaborador) con el mismo servicio que usa el alta.
 *  3. ESCRIBIR EL ROL EFECTIVO. Cada membresía de `business_unit_users` recibe
 *     el rol que la cuenta tiene DENTRO de esa empresa, que es de donde lo lee
 *     el runtime a partir de ahora.
 *
 * POR QUÉ ADOPTAR VA ANTES QUE SEMBRAR. Al revés, el "Dueño" heredado de un
 * cliente choca contra el `owner` recién sembrado de su propia empresa: el
 * candado (empresa, slug) de `1789528501204` rechaza el segundo. Y resolver esa
 * colisión pasando las cuentas del rol heredado al sembrado sería peor que un
 * error: un "Administrador" heredado con permisos recortados acabaría
 * absorbido por el `admin` nuevo, que nace con el catálogo entero. Adoptando
 * primero, cada rol heredado ocupa su slug en su empresa y la siembra —que es
 * idempotente y nunca pisa lo existente— solo agrega lo que de verdad falta.
 *
 * Idempotente de principio a fin: se puede correr, revisar el reporte y volver
 * a correr. `--dry-run` no escribe nada y dice exactamente qué haría.
 *
 * Lo que este comando NO hace, a propósito: retirar las filas globales de
 * `owner` y `empleado` ni tirar la columna CSV. Eso va en una migración
 * posterior, cuando el reporte salga en ceros; mientras tanto siguen siendo el
 * respaldo de cualquier cuenta que este backfill no haya podido resolver.
 */
export default class BackfillTenantRoles extends BaseCommand {
  static commandName = 'backfill:tenant-roles'
  static description = 'Da empresa dueña a los roles heredados y escribe el rol efectivo por empresa'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Informa qué haría, sin escribir nada' })
  declare dryRun: boolean

  @flags.number({ description: 'Acota la corrida a una sola empresa (business_unit_id)' })
  declare businessUnit: number

  private seeded = 0
  private adopted = 0
  private cloned = 0
  private memberships = 0
  private unresolved: string[] = []

  async run() {
    const units = await this.loadTargetBusinessUnits()
    this.logger.info(
      `${units.length} empresa(s) en alcance${this.dryRun ? ' — simulación, no se escribe nada' : ''}`
    )

    // El orden NO es negociable, ver la nota de la clase.
    await this.adoptLegacyRoles(units)
    await this.provisionRoles(units)
    await this.writeEffectiveRoles(units)

    this.report()
  }

  private async loadTargetBusinessUnits(): Promise<BusinessUnit[]> {
    const query = BusinessUnit.query().whereNull('business_unit_deleted_at')

    if (this.businessUnit) {
      query.where('business_unit_id', this.businessUnit)
    }

    return query.orderBy('business_unit_id', 'asc')
  }

  /** Paso 1 — el juego propio de cada empresa. */
  private async provisionRoles(units: BusinessUnit[]): Promise<void> {
    for (const unit of units) {
      const existing = await Role.query()
        .whereNull('role_deleted_at')
        .where('business_unit_id', unit.businessUnitId)
        .count('* as total')

      const total = Number(existing[0]?.$extras.total ?? 0)

      if (this.dryRun) {
        this.logger.info(
          `  [simulación] empresa ${unit.businessUnitId} (${unit.businessUnitName}): ` +
            `${total} rol(es) propios hoy; se sembrarían los que falten de owner/admin/empleado`
        )
        continue
      }

      await db.transaction(async (trx) => {
        await new TenantRoleProvisioningService().provision(unit.businessUnitId, trx)
      })
      this.seeded++
    }
  }

  /**
   * Paso 2 — los roles heredados encuentran dueño.
   *
   * `root` queda fuera: es de la plataforma y su sitio es `business_unit_id`
   * NULL. Las filas globales de `owner` y `empleado` también quedan fuera aquí
   * —no tienen CSV que las ate a nadie— y se resuelven en el paso 3, donde cada
   * cuenta se reapunta al rol homónimo de SU empresa.
   */
  private async adoptLegacyRoles(units: BusinessUnit[]): Promise<void> {
    const unitIds = new Set(units.map((unit) => unit.businessUnitId))

    const legacyRoles = await Role.query()
      .whereNull('role_deleted_at')
      .whereNull('business_unit_id')
      .whereNot('role_slug', PLATFORM_ROLE_SLUG)
      .orderBy('role_id', 'asc')

    for (const role of legacyRoles) {
      const owners = await this.resolveCsvOwners(role, unitIds)

      if (owners.length === 0) {
        continue
      }

      if (owners.length === 1) {
        const clash = await this.findLiveRoleWithSlug(role.roleSlug, owners[0].businessUnitId)

        if (clash) {
          // Red de seguridad: con el orden correcto esto no debería ocurrir,
          // porque el pre-check de `1789528501204` garantiza que no hay dos
          // roles vivos con el mismo slug. Si ocurre, se reporta y NO se mueve
          // a nadie: fundir dos roles distintos es una decisión humana.
          this.unresolved.push(
            `rol ${role.roleId} ("${role.roleName}") no se puede mudar a la empresa ` +
              `${owners[0].businessUnitId}: ya vive ahí el rol ${clash.roleId} con el mismo slug ` +
              `"${role.roleSlug}"`
          )
          continue
        }

        if (this.dryRun) {
          this.logger.info(
            `  [simulación] rol ${role.roleId} "${role.roleName}" -> empresa ${owners[0].businessUnitId}`
          )
          continue
        }

        role.businessUnitId = owners[0].businessUnitId
        role.roleBusinessAccess = ''
        await role.save()
        this.adopted++
        continue
      }

      if (this.dryRun) {
        this.logger.info(
          `  [simulación] rol ${role.roleId} "${role.roleName}" lo comparten ` +
            `${owners.length} empresas -> se clonaría una copia por empresa y se retiraría el original`
        )
        continue
      }

      await this.cloneRolePerBusinessUnit(role, owners)
    }
  }

  /** Rol vivo de esa empresa que ya ocupa el slug, si lo hay. */
  private async findLiveRoleWithSlug(slug: string, businessUnitId: number): Promise<Role | null> {
    const role = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', slug)
      .where('business_unit_id', businessUnitId)
      .first()

    return role ?? null
  }

  /** Empresas vivas y en alcance que el CSV del rol nombra. */
  private async resolveCsvOwners(role: Role, unitIds: Set<number>): Promise<BusinessUnit[]> {
    const slugs = (role.roleBusinessAccess ?? '')
      .split(',')
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0)

    if (slugs.length === 0) {
      return []
    }

    const units = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .whereIn('business_unit_slug', slugs)

    return units.filter((unit) => unitIds.has(unit.businessUnitId))
  }

  /**
   * Una copia del rol por empresa, con sus permisos y sus departamentos, y el
   * original retirado.
   *
   * Todo en una transacción por rol: a medias dejaría empresas con la copia
   * puesta y otras apuntando a un rol ya retirado.
   *
   * Si la empresa YA tiene un rol vivo con ese slug —el que acaba de sembrar el
   * paso 1, por ejemplo un "owner" heredado que choca con el owner propio— no
   * se clona nada: sus cuentas se reapuntan al rol que ya existe. El candado
   * (empresa, slug) de `1789528501204` no permitiría la copia, y tampoco haría
   * falta.
   */
  private async cloneRolePerBusinessUnit(role: Role, owners: BusinessUnit[]): Promise<void> {
    await db.transaction(async (trx) => {
      const grants = await RoleSystemPermission.query({ client: trx }).where('role_id', role.roleId)
      const departments = await RoleDepartment.query({ client: trx }).where('role_id', role.roleId)

      let resolvedEveryUnit = true

      for (const unit of owners) {
        const existing = await Role.query({ client: trx })
          .whereNull('role_deleted_at')
          .where('role_slug', role.roleSlug)
          .where('business_unit_id', unit.businessUnitId)
          .first()

        if (existing) {
          // Mismo criterio que en la mudanza: no se funden dos roles distintos
          // por su cuenta. Las cuentas de esta empresa se quedan donde están y
          // el caso se reporta.
          this.unresolved.push(
            `rol ${role.roleId} ("${role.roleName}") no se puede copiar a la empresa ` +
              `${unit.businessUnitId}: ya vive ahí el rol ${existing.roleId} con el mismo slug ` +
              `"${role.roleSlug}"`
          )
          resolvedEveryUnit = false
          continue
        }

        const target = await this.copyRole(role, unit, grants, departments, trx)
        this.cloned++

        await this.repointAccounts(role, unit, target, trx)
      }

      // El original se retira SOLO si todas sus empresas quedaron cubiertas. Con
      // una sola sin resolver, sus cuentas seguirían apuntando aquí y retirarlo
      // las dejaría con un rol muerto.
      if (!resolvedEveryUnit) {
        this.unresolved.push(
          `rol ${role.roleId} ("${role.roleName}") se queda como estaba: no todas sus empresas ` +
            'pudieron recibir copia'
        )
        return
      }

      role.useTransaction(trx)
      role.deletedAt = DateTime.now()
      await role.save()
    })
  }

  private async copyRole(
    role: Role,
    unit: BusinessUnit,
    grants: RoleSystemPermission[],
    departments: RoleDepartment[],
    trx: TransactionClientContract
  ): Promise<Role> {
    const copy = new Role()
    copy.roleName = role.roleName
    copy.roleSlug = role.roleSlug
    copy.roleDescription = role.roleDescription
    copy.roleActive = role.roleActive
    copy.roleManagementDays = role.roleManagementDays
    copy.businessUnitId = unit.businessUnitId
    copy.roleBusinessAccess = ''
    copy.useTransaction(trx)
    await copy.save()

    if (grants.length > 0) {
      await RoleSystemPermission.createMany(
        grants.map((grant) => ({
          roleId: copy.roleId,
          systemPermissionId: grant.systemPermissionId,
        })),
        { client: trx }
      )
    }

    if (departments.length > 0) {
      await RoleDepartment.createMany(
        departments.map((department) => ({
          roleId: copy.roleId,
          departmentId: department.departmentId,
        })),
        { client: trx }
      )
    }

    return copy
  }

  /**
   * Las cuentas que traían el rol original y pertenecen a esta empresa pasan a
   * su copia: primero la membresía —que es la fuente nueva— y después
   * `users.role_id`, que sigue siendo el respaldo mientras exista.
   */
  private async repointAccounts(
    role: Role,
    unit: BusinessUnit,
    target: Role,
    trx: TransactionClientContract
  ): Promise<void> {
    const memberships = await BusinessUnitUser.query({ client: trx })
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('business_unit_user_deleted_at')

    const userIds = memberships.map((membership) => membership.userId)
    if (userIds.length === 0) {
      return
    }

    const affected = await User.query({ client: trx })
      .whereIn('user_id', userIds)
      .where('role_id', role.roleId)

    if (affected.length === 0) {
      return
    }

    const affectedIds = affected.map((user) => user.userId)

    await BusinessUnitUser.query({ client: trx })
      .where('business_unit_id', unit.businessUnitId)
      .whereIn('user_id', affectedIds)
      .update({ role_id: target.roleId })

    await User.query({ client: trx })
      .whereIn('user_id', affectedIds)
      .where('role_id', role.roleId)
      .update({ role_id: target.roleId })
  }

  /**
   * Paso 3 — el rol efectivo queda escrito en cada membresía sin rol.
   *
   * Tres casos y un reporte:
   *  - el rol de la cuenta ya es de esta empresa -> se copia tal cual;
   *  - el rol de la cuenta es global (`root`, o un `owner`/`empleado` heredado)
   *    -> se escribe el rol homónimo propio de la empresa, que el paso 1 acaba
   *    de sembrar; `root` se queda como está, porque es de la plataforma;
   *  - el rol de la cuenta es de OTRA empresa -> no se inventa nada: la
   *    membresía se deja sin rol y se reporta, porque elegir por ella sería
   *    darle a alguien un acceso que nadie le concedió.
   */
  private async writeEffectiveRoles(units: BusinessUnit[]): Promise<void> {
    for (const unit of units) {
      const pending = await BusinessUnitUser.query()
        .where('business_unit_id', unit.businessUnitId)
        .whereNull('business_unit_user_deleted_at')
        .whereNull('role_id')
        .preload('user', (userQuery) => userQuery.preload('role'))

      for (const membership of pending) {
        const accountRole = membership.user?.role
        if (!accountRole) {
          this.unresolved.push(
            `membresía ${membership.businessUnitUserId}: la cuenta ${membership.userId} no resuelve a un rol vivo`
          )
          continue
        }

        const resolution = await this.resolveTargetRole(accountRole, unit.businessUnitId)

        if (resolution.kind === 'foreign') {
          this.unresolved.push(
            `membresía ${membership.businessUnitUserId}: la cuenta ${membership.userId} trae el rol ` +
              `${accountRole.roleId} ("${accountRole.roleName}"), que pertenece a la empresa ` +
              `${accountRole.businessUnitId} y no a la ${unit.businessUnitId}`
          )
          continue
        }

        if (resolution.kind === 'missingHomonym') {
          // En simulación el paso 1 no escribió nada, así que el rol homónimo
          // todavía no existe: se informa como resoluble en lugar de acusar un
          // problema que la corrida real no tendría.
          if (this.dryRun && isTenantRoleSlug(resolution.slug)) {
            this.logger.info(
              `  [simulación] membresía ${membership.businessUnitUserId} -> rol "${resolution.slug}" ` +
                `propio de la empresa ${unit.businessUnitId} (lo siembra el paso 1)`
            )
            continue
          }

          this.unresolved.push(
            `membresía ${membership.businessUnitUserId}: la empresa ${unit.businessUnitId} no tiene ` +
              `un rol "${resolution.slug}" propio al que trasladar a la cuenta ${membership.userId}`
          )
          continue
        }

        if (this.dryRun) {
          this.logger.info(
            `  [simulación] membresía ${membership.businessUnitUserId} -> rol ${resolution.role.roleId} ` +
              `("${resolution.role.roleName}")`
          )
          continue
        }

        membership.roleId = resolution.role.roleId
        await membership.save()
        this.memberships++
      }
    }
  }

  private async resolveTargetRole(
    accountRole: Role,
    businessUnitId: number
  ): Promise<TargetRoleResolution> {
    if (accountRole.businessUnitId === businessUnitId) {
      return { kind: 'role', role: accountRole }
    }

    // Rol de OTRA empresa: no se traduce. Elegir por la cuenta sería concederle
    // un acceso que nadie le dio.
    if (accountRole.businessUnitId !== null) {
      return { kind: 'foreign' }
    }

    // Rol global. `root` vale en cualquier empresa; los demás se traducen al
    // rol homónimo propio de esta.
    if (accountRole.roleSlug === PLATFORM_ROLE_SLUG) {
      return { kind: 'role', role: accountRole }
    }

    const homonym = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', accountRole.roleSlug)
      .where('business_unit_id', businessUnitId)
      .first()

    return homonym
      ? { kind: 'role', role: homonym }
      : { kind: 'missingHomonym', slug: accountRole.roleSlug }
  }

  private report(): void {
    this.logger.info('---')
    this.logger.info(`Empresas sembradas o confirmadas: ${this.seeded}`)
    this.logger.info(`Roles heredados con dueño nuevo: ${this.adopted}`)
    this.logger.info(`Copias creadas por rol compartido: ${this.cloned}`)
    this.logger.info(`Membresías con rol efectivo escrito: ${this.memberships}`)

    if (this.unresolved.length === 0) {
      this.logger.success('Sin membresías pendientes.')
      return
    }

    this.logger.warning(`${this.unresolved.length} membresía(s) sin resolver:`)
    for (const line of this.unresolved) {
      this.logger.warning(`  - ${line}`)
    }
    this.logger.warning(
      'Estas cuentas siguen operando con el respaldo `users.role_id`. Resolverlas antes de ' +
        'retirar los roles globales.'
    )
  }
}
