import ComplaintIdentityRevealAudit from '#models/complaint_identity_reveal_audit'
import Employee from '#models/employee'
import type {
  ComplaintIdentityRevealAuditRow,
  ComplaintReporterIdentity,
} from '../interfaces/complaint_interface.js'

/**
 * Auditoría inmutable de revelaciones de identidad del buzón de quejas (NOM-035).
 */
export default class ComplaintIdentityRevealService {
  async appendAudit(input: {
    complaintId: number
    revealedByUserId: number
    justification: string
  }): Promise<ComplaintIdentityRevealAudit> {
    return ComplaintIdentityRevealAudit.create({
      complaintId: input.complaintId,
      revealedByUserId: input.revealedByUserId,
      complaintIdentityRevealAuditJustification: input.justification.trim(),
    })
  }

  async listByComplaintId(complaintId: number): Promise<ComplaintIdentityRevealAuditRow[]> {
    const rows = await ComplaintIdentityRevealAudit.query()
      .where('complaint_id', complaintId)
      .whereNull('complaint_identity_reveal_audit_deleted_at')
      .preload('revealedByUser', (userQuery) => {
        userQuery.preload('person')
      })
      .orderBy('complaint_identity_reveal_audit_created_at', 'asc')
      .orderBy('complaint_identity_reveal_audit_id', 'asc')

    return rows.map((row) => this.toRow(row))
  }

  async loadReporterIdentity(employeeId: number): Promise<ComplaintReporterIdentity | null> {
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .preload('person')
      .preload('department')
      .preload('position')
      .first()

    if (!employee) {
      return null
    }

    return this.serializeReporterIdentity(employee)
  }

  serializeReporterIdentity(employee: Employee): ComplaintReporterIdentity {
    const person = employee.person
    const firstName = person?.personFirstname ?? employee.employeeFirstName ?? ''
    const lastName = person?.personLastname ?? employee.employeeLastName ?? ''
    const secondLastName = person?.personSecondLastname ?? employee.employeeSecondLastName ?? ''
    const fullName =
      [firstName, lastName, secondLastName].map((part) => (part ?? '').trim()).filter(Boolean).join(' ') ||
      '—'

    return {
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode ? String(employee.employeeCode) : null,
      fullName,
      departmentName: employee.department?.departmentName ?? null,
      positionName: employee.position?.positionName ?? null,
    }
  }

  private toRow(record: ComplaintIdentityRevealAudit): ComplaintIdentityRevealAuditRow {
    const person = record.revealedByUser?.person
    const actorDisplayName = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter(Boolean)
          .join(' ')
          .trim() || null
      : (record.revealedByUser?.userEmail ?? null)

    return {
      complaintIdentityRevealAuditId: record.complaintIdentityRevealAuditId,
      complaintId: record.complaintId,
      revealedByUserId: record.revealedByUserId,
      actorDisplayName,
      justification: record.complaintIdentityRevealAuditJustification,
      createdAt: record.complaintIdentityRevealAuditCreatedAt.toISO()!,
    }
  }
}
