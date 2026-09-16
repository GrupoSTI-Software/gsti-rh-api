import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import RepseRegistration from '#models/repse_registration'
import { toCalendarIsoDate, toBusinessDateString } from '#utils/business_date'
import type { BadgeRepository } from './badge.repository.js'
import type { BadgeEmployeeContext, BadgePublicRow } from './dto/badge.dto.js'

/** Longitud del token (`randomBytes(32).toString('base64url')` = 43 chars URL-safe). */
const BADGE_TOKEN_LENGTH = 43

function generateBadgeToken(): string {
  return randomBytes(32).toString('base64url')
}

/** `employeeTerminatedDate` ≤ hoy (zona de negocio) ⇒ dado de baja. */
function isTerminated(employeeTerminatedDate: unknown): boolean {
  const iso = toCalendarIsoDate(employeeTerminatedDate)
  if (!iso) return false
  return iso <= toBusinessDateString()
}

export default class BadgeRepositoryMysql implements BadgeRepository {
  async findActiveEmployeeInTenant(
    employeeId: number,
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext | null> {
    if (businessUnitIds.length === 0) return null

    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_deleted_at')
      .preload('person')
      .preload('businessUnit')
      .preload('position')
      .first()

    return this.toContextIfActive(employee)
  }

  async findActiveEmployeesInTenant(
    employeeIds: number[],
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext[]> {
    if (businessUnitIds.length === 0 || employeeIds.length === 0) return []

    const dedupedIds = [...new Set(employeeIds)]

    const employees = await Employee.query()
      .whereIn('employee_id', dedupedIds)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_deleted_at')
      .preload('person')
      .preload('businessUnit')
      .preload('position')

    const byId = new Map<number, BadgeEmployeeContext>()
    for (const employee of employees) {
      const context = await this.toContextIfActive(employee)
      if (context) {
        byId.set(context.employeeId, context)
      }
    }

    return dedupedIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
  }

  async findActiveEmployeeByPersonId(
    personId: number,
    businessUnitIds: number[]
  ): Promise<BadgeEmployeeContext | null> {
    if (businessUnitIds.length === 0) return null

    const employee = await Employee.query()
      .where('person_id', personId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_deleted_at')
      .preload('person')
      .preload('businessUnit')
      .preload('position')
      .first()

    return this.toContextIfActive(employee)
  }

  async resolveOrCreateToken(employeeId: number): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await Employee.query()
        .where('employee_id', employeeId)
        .select('employee_badge_token')
        .first()

      if (current?.employeeBadgeToken) {
        return current.employeeBadgeToken
      }

      const candidate = generateBadgeToken()
      try {
        const affected = await db
          .from('employees')
          .where('employee_id', employeeId)
          .whereNull('employee_badge_token')
          .update({ employee_badge_token: candidate })

        if (Number(affected) > 0) {
          return candidate
        }
      } catch {
        // Colisión UNIQUE (probabilidad despreciable a 256 bits): reintenta una vez.
      }
    }

    throw new Error('No fue posible generar un código de verificación único para el gafete.')
  }

  async findPublicByToken(token: string): Promise<BadgePublicRow | null> {
    if (token.length !== BADGE_TOKEN_LENGTH) return null

    // `db.from(...)` es el query builder crudo de Knex: nunca aplica el scope
    // de `SoftDeletes` de Lucid, así que ya incluye a los empleados/BUs dados
    // de baja por diseño (equivalente al `withTrashed()` que pide el spec).
    const row = await db
      .from('employees')
      .where('employees.employee_badge_token', token)
      .innerJoin('people', 'people.person_id', 'employees.person_id')
      .innerJoin('business_units', 'business_units.business_unit_id', 'employees.business_unit_id')
      .leftJoin('repse_registrations', (join) => {
        join
          .on('repse_registrations.business_unit_id', '=', 'employees.business_unit_id')
          .andOnVal('repse_registrations.repse_registration_status', 'active')
          .andOnNull('repse_registrations.repse_registration_deleted_at')
      })
      .select(
        'people.person_firstname as personFirstname',
        'people.person_lastname as personLastname',
        'people.person_second_lastname as personSecondLastname',
        'business_units.business_unit_legal_name as businessUnitLegalName',
        'business_units.business_unit_name as businessUnitName',
        'business_units.business_unit_active as businessUnitActive',
        'business_units.business_unit_deleted_at as businessUnitDeletedAt',
        'employees.employee_deleted_at as employeeDeletedAt',
        'employees.employee_terminated_date as employeeTerminatedDate',
        'repse_registrations.repse_registration_folio as repseFolio',
        'repse_registrations.repse_registration_expires_at as repseExpiresAt',
        'repse_registrations.repse_registration_registered_at as repseRegisteredAt'
      )
      .orderBy('repse_registrations.repse_registration_registered_at', 'desc')
      .first()

    if (!row) return null

    const employeeActive = !row.employeeDeletedAt && !isTerminated(row.employeeTerminatedDate)
    const businessUnitActive = Number(row.businessUnitActive) === 1 && !row.businessUnitDeletedAt

    return {
      personFirstname: row.personFirstname,
      personLastname: row.personLastname,
      personSecondLastname: row.personSecondLastname,
      businessUnitLegalName: row.businessUnitLegalName,
      businessUnitName: row.businessUnitName,
      employeeActive,
      businessUnitActive,
      repseFolio: row.repseFolio ?? null,
      repseExpiresAt: row.repseExpiresAt ? DateTime.fromJSDate(new Date(row.repseExpiresAt)) : null,
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async toContextIfActive(employee: Employee | null): Promise<BadgeEmployeeContext | null> {
    if (!employee) return null
    if (isTerminated(employee.employeeTerminatedDate)) return null

    const registration = await this.findActiveRepseRegistration(employee.businessUnitId)

    return {
      employeeId: employee.employeeId,
      businessUnitId: employee.businessUnitId,
      employeeBadgeToken: employee.employeeBadgeToken,
      personFirstname: employee.person.personFirstname,
      personLastname: employee.person.personLastname,
      personSecondLastname: employee.person.personSecondLastname,
      employeePhoto: employee.employeePhoto,
      businessUnitLegalName: employee.businessUnit.businessUnitLegalName,
      businessUnitName: employee.businessUnit.businessUnitName,
      // Mismo criterio, literal, que `findPublicByToken` (:156-157). Sin query
      // nueva: las tres consultas que llaman aqui ya precargan `businessUnit`
      // sin `select`, asi que las dos columnas ya estan en memoria.
      employeeActive: !employee.deletedAt && !isTerminated(employee.employeeTerminatedDate),
      businessUnitActive:
        Number(employee.businessUnit.businessUnitActive) === 1 && !employee.businessUnit.deletedAt,
      positionName: employee.position?.positionName ?? null,
      repseFolio: registration?.folio ?? null,
      repseExpiresAt: registration?.expiresAt ?? null,
    }
  }

  /** Registro REPSE "actual" = activo, no eliminado, más reciente por `registered_at DESC` (regla 12). */
  private async findActiveRepseRegistration(
    businessUnitId: number
  ): Promise<RepseRegistration | null> {
    return RepseRegistration.query()
      .where('business_unit_id', businessUnitId)
      .where('repse_registration_status', 'active')
      .whereNull('repse_registration_deleted_at')
      .orderBy('repse_registration_registered_at', 'desc')
      .first()
  }
}
