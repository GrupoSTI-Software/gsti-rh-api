import db from '@adonisjs/lucid/services/db'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { RelationSubQueryBuilderContract } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import User from '#models/user'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import {
  ACCESS_CANDIDATE_EXCLUDED_ROLE_SLUGS,
  eligibleIds,
  joinName,
} from './employee_access.rules.js'

/** Alcance de quien consulta. */
export interface AccessScope {
  /** Empresas de la sesión. */
  businessUnitIds: number[]
  /**
   * Usuario de la sesión cuando solo ve a los colaboradores que tiene a
   * cargo; `null` si ve a toda la plantilla (root, owner).
   */
  responsibleUserId: number | null
}

/** Usuario que puede consultar al colaborador. */
export interface ConsultedByItem {
  userResponsibleEmployeeId: number
  userId: number
  name: string
  position: string | null
  department: string | null
  roleName: string | null
  isDirectBoss: boolean
}

/** Colaborador que el usuario del colaborador puede consultar. */
export interface CanConsultItem {
  userResponsibleEmployeeId: number
  employeeId: number
  name: string
  position: string | null
  department: string | null
  isDirectBoss: boolean
}

/** Usuario que se puede agregar a "Quién puede consultar". */
export interface UserCandidate {
  userId: number
  name: string
  position: string | null
  department: string | null
  roleName: string | null
}

/** Colaborador que se puede agregar a "Personal que puede consultar". */
export interface EmployeeCandidate {
  employeeId: number
  name: string
  position: string | null
  department: string | null
  /** Solo para buscar: la pantalla no lo muestra. */
  employeeCode: string
}

/** Resultado de marcar o desmarcar una jefatura directa. */
export type DirectBossResult =
  | { status: 'ok' }
  | {
      status: 'taken'
      /** Colaborador del acceso. */
      employeeName: string
      /** Su jefatura directa actual. */
      currentBossName: string
      /** Quien la tomaría. */
      newBossName: string
    }

const CANDIDATE_LIMIT = 3000

type EmployeeQuery =
  | ModelQueryBuilderContract<typeof Employee>
  | RelationSubQueryBuilderContract<typeof Employee>

const employeeName = (employee: Employee): string =>
  joinName(employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName)

const userName = (user: User): string =>
  joinName(
    user.person?.personFirstname,
    user.person?.personLastname,
    user.person?.personSecondLastname
  )

/**
 * Acceso a la información de un colaborador desde su ficha: quién puede
 * consultarlo, a quién puede consultar su usuario y la jefatura directa.
 *
 * Todo se acota a las empresas de la sesión y, si quien consulta solo ve a
 * los colaboradores que tiene a cargo, también a ellos: es el mismo candado
 * que ya aplicaba la pestaña de asignados.
 */
export default class EmployeeAccessService {
  /** Colaborador de la empresa activa, visible para quien consulta. */
  async findEmployee(employeeId: number, scope: AccessScope): Promise<Employee | null> {
    if (scope.businessUnitIds.length === 0) return null
    const query = Employee.query()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', scope.businessUnitIds)
      .whereNull('employee_deleted_at')
    this.restrictToVisible(query, scope)
    return query.first()
  }

  /** Usuario del colaborador; sin él no puede consultar a nadie. */
  async employeeUser(employee: Employee): Promise<User | null> {
    return User.query().where('person_id', employee.personId).whereNull('user_deleted_at').first()
  }

  /** Usuarios que pueden consultar al colaborador; la jefatura directa primero. */
  async consultedBy(employee: Employee, scope: AccessScope): Promise<ConsultedByItem[]> {
    const rows = await UserResponsibleEmployee.query()
      .where('employee_id', employee.employeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .whereHas('user', (userQuery) => {
        userQuery.whereNull('user_deleted_at')
      })
      .preload('user')
      .orderBy('user_responsible_employee_direct_boss', 'desc')
      .orderBy('user_responsible_employee_id', 'asc')

    const profiles = await this.employeesByPerson(
      rows.map((row) => row.user.personId),
      scope
    )
    return rows.map((row) => {
      const profile = profiles.get(row.user.personId)
      return {
        userResponsibleEmployeeId: row.userResponsibleEmployeeId,
        userId: row.userId,
        name: userName(row.user),
        position: profile?.position?.positionName ?? null,
        department: profile?.department?.departmentName ?? null,
        roleName: row.user.role?.roleName ?? null,
        isDirectBoss: row.userResponsibleEmployeeDirectBoss === 1,
      }
    })
  }

  /** Colaboradores que el usuario del colaborador puede consultar. */
  async canConsult(employeeUser: User | null, scope: AccessScope): Promise<CanConsultItem[]> {
    if (!employeeUser) return []
    const rows = await UserResponsibleEmployee.query()
      .where('user_id', employeeUser.userId)
      .whereNull('user_responsible_employee_deleted_at')
      .whereHas('employee', (employeeQuery) => {
        employeeQuery
          .whereIn('business_unit_id', scope.businessUnitIds)
          .whereNull('employee_deleted_at')
        this.restrictToVisible(employeeQuery, scope)
      })
      .preload('employee', (employeeQuery) => {
        employeeQuery.preload('department').preload('position')
      })
      .orderBy('user_responsible_employee_id', 'asc')

    return rows.map((row) => ({
      userResponsibleEmployeeId: row.userResponsibleEmployeeId,
      employeeId: row.employeeId,
      name: employeeName(row.employee),
      position: row.employee.position?.positionName ?? null,
      department: row.employee.department?.departmentName ?? null,
      isDirectBoss: row.userResponsibleEmployeeDirectBoss === 1,
    }))
  }

  /** Usuarios de la empresa que todavía no pueden consultar al colaborador. */
  async userCandidates(
    employee: Employee,
    employeeUser: User | null,
    scope: AccessScope
  ): Promise<UserCandidate[]> {
    if (scope.businessUnitIds.length === 0) return []
    const current = await this.consultedBy(employee, scope)
    const taken = current.map((item) => item.userId)
    if (employeeUser) taken.push(employeeUser.userId)

    const users = await User.query()
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .whereHas('businessUnits', (unitQuery) => {
        unitQuery.whereIn('business_units.business_unit_id', scope.businessUnitIds)
      })
      .whereHas('role', (roleQuery) => {
        roleQuery.whereNotIn('role_slug', [...ACCESS_CANDIDATE_EXCLUDED_ROLE_SLUGS])
      })
      .whereHas('person', (personQuery) => {
        personQuery.whereNull('person_deleted_at')
      })
      .if(taken.length > 0, (query) => {
        query.whereNotIn('user_id', taken)
      })
      .preload('person')
      .preload('role')
      .limit(CANDIDATE_LIMIT)

    const profiles = await this.employeesByPerson(
      users.map((user) => user.personId),
      scope
    )
    return users
      .map((user) => {
        const profile = profiles.get(user.personId)
        return {
          userId: user.userId,
          name: userName(user),
          position: profile?.position?.positionName ?? null,
          department: profile?.department?.departmentName ?? null,
          roleName: user.role?.roleName ?? null,
        }
      })
      .filter((candidate) => candidate.name !== '')
      .sort((first, second) => first.name.localeCompare(second.name, 'es'))
  }

  /** Colaboradores activos que el usuario del colaborador todavía no consulta. */
  async employeeCandidates(
    employee: Employee,
    employeeUser: User | null,
    scope: AccessScope
  ): Promise<EmployeeCandidate[]> {
    if (!employeeUser || scope.businessUnitIds.length === 0) return []
    const current = await this.canConsult(employeeUser, scope)
    const taken = current.map((item) => item.employeeId)
    taken.push(employee.employeeId)
    const today = DateTime.now().toISODate()

    const query = Employee.query()
      .whereIn('business_unit_id', scope.businessUnitIds)
      .whereNull('employee_deleted_at')
      .where((activeQuery) => {
        activeQuery
          .whereNull('employee_terminated_date')
          .orWhere('employee_terminated_date', '>', today ?? '')
      })
      .whereNotIn('employee_id', taken)
      .preload('department')
      .preload('position')
      .orderBy('employee_first_name', 'asc')
      .orderBy('employee_last_name', 'asc')
      .limit(CANDIDATE_LIMIT)
    this.restrictToVisible(query, scope)

    const employees = await query
    return employees.map((candidate) => ({
      employeeId: candidate.employeeId,
      name: employeeName(candidate),
      position: candidate.position?.positionName ?? null,
      department: candidate.department?.departmentName ?? null,
      employeeCode: String(candidate.employeeCode ?? ''),
    }))
  }

  /** Da acceso a los usuarios pedidos que siguen siendo candidatos. */
  async addConsultedBy(
    employee: Employee,
    employeeUser: User | null,
    userIds: number[],
    scope: AccessScope
  ): Promise<number> {
    const candidates = await this.userCandidates(employee, employeeUser, scope)
    const ids = eligibleIds(
      userIds,
      candidates.map((candidate) => candidate.userId)
    )
    if (ids.length === 0) return 0
    await UserResponsibleEmployee.createMany(
      ids.map((userId) => ({
        userId,
        employeeId: employee.employeeId,
        userResponsibleEmployeeReadonly: 0,
        userResponsibleEmployeeDirectBoss: 0,
      }))
    )
    return ids.length
  }

  /** Agrega los colaboradores pedidos que siguen siendo candidatos. */
  async addCanConsult(
    employee: Employee,
    employeeUser: User,
    employeeIds: number[],
    scope: AccessScope
  ): Promise<number> {
    const candidates = await this.employeeCandidates(employee, employeeUser, scope)
    const ids = eligibleIds(
      employeeIds,
      candidates.map((candidate) => candidate.employeeId)
    )
    if (ids.length === 0) return 0
    await UserResponsibleEmployee.createMany(
      ids.map((employeeId) => ({
        userId: employeeUser.userId,
        employeeId,
        userResponsibleEmployeeReadonly: 0,
        userResponsibleEmployeeDirectBoss: 0,
      }))
    )
    return ids.length
  }

  /**
   * Acceso de la ficha: lo consulta el colaborador o lo consulta su usuario.
   * Cualquier otro id responde como inexistente.
   */
  async findOwnedAccess(
    employee: Employee,
    employeeUser: User | null,
    userResponsibleEmployeeId: number
  ): Promise<UserResponsibleEmployee | null> {
    return UserResponsibleEmployee.query()
      .where('user_responsible_employee_id', userResponsibleEmployeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .where((ownerQuery) => {
        ownerQuery.where('employee_id', employee.employeeId)
        if (employeeUser) ownerQuery.orWhere('user_id', employeeUser.userId)
      })
      .first()
  }

  /**
   * Marca o desmarca la jefatura directa de un acceso. Un colaborador tiene una
   * sola jefatura directa: si ya tiene otra, responde quién es y solo la
   * reemplaza cuando se confirma (`replace`). Quien la pierde conserva su
   * acceso de consulta. La jefatura directa nunca es de solo lectura.
   */
  async setDirectBoss(
    access: UserResponsibleEmployee,
    directBoss: boolean,
    replace: boolean
  ): Promise<DirectBossResult> {
    if (!directBoss) {
      access.userResponsibleEmployeeDirectBoss = 0
      await access.save()
      return { status: 'ok' }
    }

    const current = await UserResponsibleEmployee.query()
      .where('employee_id', access.employeeId)
      .where('user_responsible_employee_direct_boss', 1)
      .whereNull('user_responsible_employee_deleted_at')
      .whereNot('user_responsible_employee_id', access.userResponsibleEmployeeId)
      .preload('user')
      .first()

    if (current && !replace) {
      await access.load('user')
      await access.load('employee')
      return {
        status: 'taken',
        employeeName: employeeName(access.employee),
        currentBossName: userName(current.user),
        newBossName: userName(access.user),
      }
    }

    await db.transaction(async (trx) => {
      if (current) {
        current.useTransaction(trx)
        current.userResponsibleEmployeeDirectBoss = 0
        await current.save()
      }
      access.useTransaction(trx)
      access.userResponsibleEmployeeDirectBoss = 1
      access.userResponsibleEmployeeReadonly = 0
      await access.save()
    })
    return { status: 'ok' }
  }

  /** Quita un acceso (borrado lógico). */
  async remove(access: UserResponsibleEmployee): Promise<void> {
    await access.delete()
  }

  /** Ficha de empleado de cada persona, dentro de las empresas de la sesión. */
  private async employeesByPerson(
    personIds: number[],
    scope: AccessScope
  ): Promise<Map<number, Employee>> {
    const ids = [...new Set(personIds)]
    if (ids.length === 0 || scope.businessUnitIds.length === 0) return new Map()
    const employees = await Employee.query()
      .whereIn('person_id', ids)
      .whereIn('business_unit_id', scope.businessUnitIds)
      .whereNull('employee_deleted_at')
      .preload('department')
      .preload('position')
      .orderBy('employee_id', 'desc')
    const byPerson = new Map<number, Employee>()
    for (const profile of employees) {
      if (!byPerson.has(profile.personId)) byPerson.set(profile.personId, profile)
    }
    return byPerson
  }

  /**
   * Candado de colaboradores a cargo: quien no ve a toda la plantilla solo ve
   * a los colaboradores de los que es responsable y a sí mismo.
   */
  private restrictToVisible(query: EmployeeQuery, scope: AccessScope): void {
    const responsibleUserId = scope.responsibleUserId
    if (responsibleUserId === null) return
    query.where((visibleQuery) => {
      visibleQuery
        .whereHas('userResponsibleEmployee', (accessQuery) => {
          accessQuery
            .where('user_id', responsibleUserId)
            .whereNull('user_responsible_employee_deleted_at')
        })
        .orWhereHas('person', (personQuery) => {
          personQuery.whereHas('user', (userQuery) => {
            userQuery.where('user_id', responsibleUserId)
          })
        })
    })
  }
}
