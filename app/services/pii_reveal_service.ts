import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import EmployeeBank from '#models/employee_bank'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import WorkDisability from '#models/work_disability'
import WorkDisabilityNote from '#models/work_disability_note'
import TraumaticEventReport from '#models/traumatic_event_report'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import EmployeeSpouse from '#models/employee_spouse'
import EmpresaContratante from '#models/empresa_contratante'
import ProveedorRepse from '#models/proveedor_repse'
import Employee from '#models/employee'
import EmployeeSalaryHistory from '#models/employee_salary_history'
import PositionSalaryRange from '#models/position_salary_range'
import PositionSalaryRangeAudit from '#models/position_salary_range_audit'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import PiiAccessLogService from '#services/pii_access_log_service'
import type { PiiAccessInputInterface } from '../interfaces/pii_access_input_interface.js'

/**
 * Resultado de un reveal exitoso.
 */
export interface PiiRevealResult {
  /** Valor en claro del campo solicitado. */
  value: unknown
}

/** Registro resuelto con empresa propia y titular opcional (USRH1788478865946). */
export interface ResolvedSensitiveRecord {
  value: unknown
  businessUnitId: number
  subjectEmployeeId: number | null
}

/**
 * Datos de contexto de red que el caller provee para el log de auditoría.
 */
export type PiiRevealLogContext = Pick<
  PiiAccessInputInterface,
  'accessorUserId' | 'accessorIp' | 'accessorUserAgent' | 'requestId' | 'originModule'
>

/**
 * Servicio de reveal de datos personales sensibles.
 *
 * Registry: Person, EmployeeBank, EmployeeMedicalCondition, WorkDisabilityNote,
 * TraumaticEventReport, EmployeeLactationPeriod, EmployeeEmergencyContact,
 * EmployeeSpouse, EmpresaContratante, ProveedorRepse, Employee,
 * EmployeeSalaryHistory, PositionSalaryRange, PositionSalaryRangeAudit.
 */
export default class PiiRevealService {
  private catalogService = new SensitiveFieldsCatalogService()
  private logService = new PiiAccessLogService()

  async reveal(
    model: string,
    column: string,
    recordId: number,
    buScope: number[],
    logCtx: PiiRevealLogContext
  ): Promise<PiiRevealResult | null> {
    if (!this.catalogService.isMaskedInApi(model, column)) return null
    if (buScope.length === 0) return null

    const resolved = await this.resolveRecord(model, column, recordId, buScope)
    if (!resolved) return null

    await db.transaction(async (trx) => {
      await this.logService.record(
        {
          businessUnitId: resolved.businessUnitId,
          model,
          modelColumn: column,
          recordId,
          subjectEmployeeId: resolved.subjectEmployeeId,
          originModule: logCtx.originModule ?? null,
          ...logCtx,
        },
        trx
      )
    })

    return { value: resolved.value }
  }

  private readColumn(row: object, column: string): unknown {
    return (row as Record<string, unknown>)[column]
  }

  private async resolveRecord(
    model: string,
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    switch (model) {
      case 'Person':
        return this.resolvePerson(column, recordId, buScope)
      case 'EmployeeBank':
        return this.resolveEmployeeBank(column, recordId, buScope)
      case 'EmployeeMedicalCondition':
        return this.resolveEmployeeMedicalCondition(column, recordId, buScope)
      case 'WorkDisabilityNote':
        return this.resolveWorkDisabilityNote(column, recordId, buScope)
      case 'TraumaticEventReport':
        return this.resolveTraumaticEventReport(column, recordId, buScope)
      case 'EmployeeLactationPeriod':
        return this.resolveEmployeeLactationPeriod(column, recordId, buScope)
      case 'EmployeeEmergencyContact':
        return this.resolveEmployeeEmergencyContact(column, recordId, buScope)
      case 'EmployeeSpouse':
        return this.resolveEmployeeSpouse(column, recordId, buScope)
      case 'EmpresaContratante':
        return this.resolveEmpresaContratante(column, recordId, buScope)
      case 'ProveedorRepse':
        return this.resolveProveedorRepse(column, recordId, buScope)
      case 'Employee':
        return this.resolveEmployee(column, recordId, buScope)
      case 'EmployeeSalaryHistory':
        return this.resolveEmployeeSalaryHistory(column, recordId, buScope)
      case 'PositionSalaryRange':
        return this.resolvePositionSalaryRange(column, recordId, buScope)
      case 'PositionSalaryRangeAudit':
        return this.resolvePositionSalaryRangeAudit(column, recordId, buScope)
      default:
        return null
    }
  }

  private async resolvePerson(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const person = await Person.query()
      .where('personId', recordId)
      .preload('employee', (q) => q.whereIn('businessUnitId', buScope))
      .first()

    if (!person?.employee) return null

    return {
      value: this.readColumn(person, column),
      businessUnitId: person.employee.businessUnitId,
      subjectEmployeeId: person.employee.employeeId,
    }
  }

  private async resolveEmployeeBank(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const scopeRow = await db
      .from('employee_banks')
      .join('employees', 'employees.employee_id', 'employee_banks.employee_id')
      .whereIn('employees.business_unit_id', buScope)
      .where('employee_banks.employee_bank_id', recordId)
      .whereNull('employee_banks.employee_bank_deleted_at')
      .select(
        'employees.business_unit_id as businessUnitId',
        'employees.employee_id as employeeId'
      )
      .first()

    if (!scopeRow) return null

    const bank = await EmployeeBank.find(recordId)
    if (!bank) return null

    return {
      value: this.readColumn(bank, column),
      businessUnitId: Number(scopeRow.businessUnitId),
      subjectEmployeeId: Number(scopeRow.employeeId),
    }
  }

  private async resolveEmployeeMedicalCondition(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const condition = await EmployeeMedicalCondition.query()
      .where('employeeMedicalConditionId', recordId)
      .whereHas('employee', (q) => q.whereIn('businessUnitId', buScope))
      .preload('employee')
      .first()

    if (!condition?.employee) return null

    return {
      value: this.readColumn(condition, column),
      businessUnitId: condition.employee.businessUnitId,
      subjectEmployeeId: condition.employee.employeeId,
    }
  }

  private async resolveWorkDisabilityNote(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const note = await WorkDisabilityNote.query()
      .where('workDisabilityNoteId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!note) return null

    const disability = await WorkDisability.query()
      .where('workDisabilityId', note.workDisabilityId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!disability) return null

    return {
      value: this.readColumn(note, column),
      businessUnitId: note.businessUnitId,
      subjectEmployeeId: disability.employeeId,
    }
  }

  private async resolveTraumaticEventReport(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const report = await TraumaticEventReport.query()
      .where('traumaticEventReportId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!report) return null

    return {
      value: this.readColumn(report, column),
      businessUnitId: report.businessUnitId,
      subjectEmployeeId: report.employeeId,
    }
  }

  private async resolveEmployeeLactationPeriod(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const period = await EmployeeLactationPeriod.query()
      .where('employeeLactationPeriodId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!period) return null

    return {
      value: this.readColumn(period, column),
      businessUnitId: period.businessUnitId,
      subjectEmployeeId: period.employeeId,
    }
  }

  private async resolveEmployeeEmergencyContact(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const contact = await EmployeeEmergencyContact.query()
      .where('employeeEmergencyContactId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!contact) return null

    return {
      value: this.readColumn(contact, column),
      businessUnitId: contact.businessUnitId,
      subjectEmployeeId: contact.employeeId,
    }
  }

  private async resolveEmployeeSpouse(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const spouse = await EmployeeSpouse.query()
      .where('employeeSpouseId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!spouse) return null

    return {
      value: this.readColumn(spouse, column),
      businessUnitId: spouse.businessUnitId,
      subjectEmployeeId: spouse.employeeId,
    }
  }

  private async resolveEmpresaContratante(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const empresa = await EmpresaContratante.query()
      .where('empresaContratanteId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!empresa) return null

    return {
      value: this.readColumn(empresa, column),
      businessUnitId: empresa.businessUnitId,
      subjectEmployeeId: null,
    }
  }

  private async resolveProveedorRepse(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const proveedor = await ProveedorRepse.query()
      .where('proveedorRepseId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!proveedor) return null

    return {
      value: this.readColumn(proveedor, column),
      businessUnitId: proveedor.businessUnitId,
      subjectEmployeeId: null,
    }
  }

  private async resolveEmployee(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const employee = await Employee.query()
      .where('employeeId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!employee) return null

    return {
      value: toAmount(this.readColumn(employee, column)),
      businessUnitId: employee.businessUnitId,
      subjectEmployeeId: employee.employeeId,
    }
  }

  private async resolveEmployeeSalaryHistory(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const history = await EmployeeSalaryHistory.query()
      .where('employeeSalaryHistoryId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!history) return null

    return {
      value: toAmount(this.readColumn(history, column)),
      businessUnitId: history.businessUnitId,
      subjectEmployeeId: history.employeeId,
    }
  }

  private async resolvePositionSalaryRange(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const range = await PositionSalaryRange.query()
      .where('positionSalaryRangeId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!range) return null

    return {
      value: toAmount(this.readColumn(range, column)),
      businessUnitId: range.businessUnitId,
      subjectEmployeeId: null,
    }
  }

  private async resolvePositionSalaryRangeAudit(
    column: string,
    recordId: number,
    buScope: number[]
  ): Promise<ResolvedSensitiveRecord | null> {
    const audit = await PositionSalaryRangeAudit.query()
      .where('positionSalaryRangeAuditId', recordId)
      .whereIn('businessUnitId', buScope)
      .first()

    if (!audit) return null

    return {
      value: toAmount(this.readColumn(audit, column)),
      businessUnitId: audit.businessUnitId,
      subjectEmployeeId: null,
    }
  }
}

const DECIMAL_AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/

/**
 * Normaliza un importe salarial revelable a número JSON o null (USRH1788478865952).
 * No redondea ni trunca; nunca devuelve texto cifrado ni máscaras.
 */
export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed === SENSITIVE_MASK) {
      return null
    }
    if (!DECIMAL_AMOUNT_PATTERN.test(trimmed)) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
