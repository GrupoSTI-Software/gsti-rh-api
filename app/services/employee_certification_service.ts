import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import { EC_ERROR_CODES } from '../constants/employee_certification_error_codes.js'
import { EmployeeCertificationError } from '../exceptions/employee_certification_error.js'

export type CertificationStatus =
  | 'no_iniciada'
  | 'vigente'
  | 'por_vencer'
  | 'vencida'
  | 'sin_renovacion'
  | 'historico'

/** Orden numérico de urgencia (menor = más urgente, aparece primero) */
const STATUS_ORDER: Record<CertificationStatus, number> = {
  no_iniciada: 0,
  vencida: 1,
  por_vencer: 2,
  vigente: 3,
  sin_renovacion: 4,
  historico: 5,
}

const DAYS_TO_EXPIRE_WARNING = 30

export type EmployeeCertificationRow = {
  certificationId: number
  name: string
  category: { id: number; name: string } | null
  isExternal: boolean
  externalUrl: string | null
  renewalPeriodDays: number | null
  isRequiredByCurrentPosition: boolean
  status: CertificationStatus
  lastCompliedAt: string | null
  expiresAt: string | null
  daysToExpire: number | null
}

export default class EmployeeCertificationService {
  /**
   * Cruza tres fuentes:
   *   1. Certificaciones requeridas por el puesto actual del empleado.
   *   2. Cumplimientos históricos del empleado (el más reciente por certificación).
   *   3. Catálogo de certificaciones (periodicidad, categoría).
   * Calcula el estado de cada certificación y ordena por urgencia.
   */
  async getForEmployee(employeeId: number): Promise<{
    rows: EmployeeCertificationRow[]
    hasPosition: boolean
  }> {
    const employee = await this.ensureEmployeeExists(employeeId)
    const hasPosition = employee.positionId !== null

    // Certificaciones requeridas por el puesto actual (activas)
    const requiredRows = hasPosition
      ? await db
          .from('position_certification_requirements as pcr')
          .join('certifications as c', 'c.certification_id', 'pcr.certification_id')
          .leftJoin(
            'certification_categories as cc',
            'cc.certification_category_id',
            'c.category_id'
          )
          .whereNull('pcr.position_certification_requirement_deleted_at')
          .where('pcr.position_id', employee.positionId!)
          .select(
            'c.certification_id',
            'c.certification_name',
            'c.is_external',
            'c.external_url',
            'c.renewal_period_days',
            'cc.certification_category_id as category_id',
            'cc.certification_category_name as category_name'
          )
      : []

    // Cumplimiento más reciente del empleado por cada certificación
    const latestCompliances = await db
      .from('employee_certifications as ec')
      .whereNull('ec.employee_certification_deleted_at')
      .where('ec.employee_id', employeeId)
      .whereIn(
        'ec.employee_certification_id',
        db
          .from('employee_certifications as ec2')
          .whereNull('ec2.employee_certification_deleted_at')
          .where('ec2.employee_id', employeeId)
          .groupBy('ec2.certification_id')
          .select(
            db.raw('MAX(ec2.employee_certification_id) as employee_certification_id')
          )
      )
      .join('certifications as c', 'c.certification_id', 'ec.certification_id')
      .leftJoin(
        'certification_categories as cc',
        'cc.certification_category_id',
        'c.category_id'
      )
      .select(
        'ec.certification_id',
        'ec.employee_certification_complied_at as complied_at',
        'ec.employee_certification_expires_at as expires_at',
        'c.certification_name',
        'c.is_external',
        'c.external_url',
        'c.renewal_period_days',
        'cc.certification_category_id as category_id',
        'cc.certification_category_name as category_name'
      )

    const requiredIds = new Set(requiredRows.map((r: any) => r.certification_id))
    const complianceMap = new Map(latestCompliances.map((c: any) => [c.certification_id, c]))

    const today = DateTime.now().startOf('day')
    const result: EmployeeCertificationRow[] = []

    // Procesar requeridas
    for (const req of requiredRows) {
      const compliance = complianceMap.get(req.certification_id)
      const row = this.buildRow(req, compliance, true, today)
      result.push(row)
    }

    // Procesar cumplimientos históricos no requeridos por puesto actual
    for (const compliance of latestCompliances) {
      if (requiredIds.has(compliance.certification_id)) {
        continue
      }
      const row = this.buildRow(compliance, compliance, false, today)
      row.status = 'historico'
      result.push(row)
    }

    // Ordenar: urgencia → nombre
    result.sort((a, b) => {
      const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (orderDiff !== 0) {
        return orderDiff
      }
      return a.name.localeCompare(b.name, 'es')
    })

    return { rows: result, hasPosition }
  }

  private buildRow(
    certSource: any,
    compliance: any | undefined,
    isRequired: boolean,
    today: DateTime
  ): EmployeeCertificationRow {
    const category =
      certSource.category_id
        ? { id: certSource.category_id, name: certSource.category_name }
        : null

    if (!compliance) {
      return {
        certificationId: certSource.certification_id,
        name: certSource.certification_name,
        category,
        isExternal: !!certSource.is_external,
        externalUrl: certSource.external_url ?? null,
        renewalPeriodDays: certSource.renewal_period_days ?? null,
        isRequiredByCurrentPosition: isRequired,
        status: 'no_iniciada',
        lastCompliedAt: null,
        expiresAt: null,
        daysToExpire: null,
      }
    }

    const compliedAt = compliance.complied_at
      ? DateTime.fromJSDate(new Date(compliance.complied_at)).startOf('day')
      : null

    const expiresAt = compliance.expires_at
      ? DateTime.fromJSDate(new Date(compliance.expires_at)).startOf('day')
      : null

    let status: CertificationStatus
    let daysToExpire: number | null = null

    if (!expiresAt) {
      status = 'sin_renovacion'
    } else if (expiresAt < today) {
      status = 'vencida'
    } else {
      const diff = Math.floor(expiresAt.diff(today, 'days').days)
      if (diff <= DAYS_TO_EXPIRE_WARNING) {
        status = 'por_vencer'
        daysToExpire = diff
      } else {
        status = 'vigente'
      }
    }

    return {
      certificationId: certSource.certification_id,
      name: certSource.certification_name,
      category,
      isExternal: !!certSource.is_external,
      externalUrl: certSource.external_url ?? null,
      renewalPeriodDays: certSource.renewal_period_days ?? null,
      isRequiredByCurrentPosition: isRequired,
      status,
      lastCompliedAt: compliedAt ? compliedAt.toISODate() : null,
      expiresAt: expiresAt ? expiresAt.toISODate() : null,
      daysToExpire,
    }
  }

  private async ensureEmployeeExists(employeeId: number) {
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!employee) {
      throw new EmployeeCertificationError(
        'El empleado no existe o fue dado de baja.',
        EC_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404
      )
    }

    return employee
  }
}
