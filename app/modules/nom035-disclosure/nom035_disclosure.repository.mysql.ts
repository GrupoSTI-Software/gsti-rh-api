import db from '@adonisjs/lucid/services/db'
import type {
  BranchOfficeOptionDto,
  BranchOfficeScopeDto,
  EmployeeContextDto,
  TabulatedRoundRefDto,
} from './dto/nom035_disclosure.dto.js'
import type { Nom035DisclosureRepository } from './nom035_disclosure.repository.js'

export default class Nom035DisclosureRepositoryMysql implements Nom035DisclosureRepository {
  async findEmployeeContextByPerson(
    personId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeContextDto | null> {
    const row = await db
      .from('employees as e')
      .leftJoin('employee_branch_offices as ebo', (join) => {
        join.on('ebo.employee_id', 'e.employee_id').andOnVal('ebo.employee_branch_office_active', 1)
      })
      .leftJoin('branch_offices as bo', 'bo.branch_office_id', 'ebo.branch_office_id')
      .where('e.person_id', personId)
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', allowedBusinessUnitIds)
      .where((query) => {
        query.whereNull('bo.branch_office_deleted_at').orWhereNull('bo.branch_office_id')
      })
      .orderBy('ebo.employee_branch_office_id', 'desc')
      .select('e.employee_id as employeeId', 'bo.branch_office_id as branchOfficeId')
      .first()

    if (!row) {
      return null
    }

    return {
      employeeId: Number(row.employeeId),
      branchOfficeId: row.branchOfficeId === null ? null : Number(row.branchOfficeId),
    }
  }

  async findBranchOfficeInScope(
    branchOfficeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<BranchOfficeScopeDto | null> {
    const row = await db
      .from('branch_offices as bo')
      .where('bo.branch_office_id', branchOfficeId)
      .whereNull('bo.branch_office_deleted_at')
      .whereIn('bo.business_unit_id', allowedBusinessUnitIds)
      .select(
        'bo.branch_office_id as branchOfficeId',
        'bo.business_unit_id as businessUnitId',
        'bo.branch_office_name as branchOfficeName'
      )
      .first()

    if (!row) {
      return null
    }

    return {
      branchOfficeId: Number(row.branchOfficeId),
      businessUnitId: Number(row.businessUnitId),
      branchOfficeName: String(row.branchOfficeName),
    }
  }

  async listBranchOfficesInScope(allowedBusinessUnitIds: number[]): Promise<BranchOfficeOptionDto[]> {
    if (allowedBusinessUnitIds.length === 0) {
      return []
    }

    const rows = await db
      .from('branch_offices as bo')
      .whereNull('bo.branch_office_deleted_at')
      .whereIn('bo.business_unit_id', allowedBusinessUnitIds)
      .orderBy('bo.branch_office_name', 'asc')
      .select(
        'bo.branch_office_id as branchOfficeId',
        'bo.business_unit_id as businessUnitId',
        'bo.branch_office_name as branchOfficeName'
      )

    return rows.map((row) => ({
      branchOfficeId: Number(row.branchOfficeId),
      businessUnitId: Number(row.businessUnitId),
      branchOfficeName: String(row.branchOfficeName),
    }))
  }

  async findLatestTabulatedRound(
    branchOfficeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<TabulatedRoundRefDto | null> {
    const row = await db
      .from('questionnaire_applications as qa')
      .where('qa.branch_office_id', branchOfficeId)
      .whereNull('qa.questionnaire_application_deleted_at')
      .whereIn('qa.business_unit_id', allowedBusinessUnitIds)
      .where('qa.questionnaire_application_status', 'cerrada')
      .whereExists((query) => {
        query
          .from('questionnaire_tabulation_results as qtr')
          .whereRaw(
            'qtr.questionnaire_application_id = qa.questionnaire_application_id'
          )
      })
      .orderBy('qa.questionnaire_application_closed_at', 'desc')
      .orderBy('qa.questionnaire_application_id', 'desc')
      .select('qa.questionnaire_application_id as applicationId')
      .first()

    if (!row) {
      return null
    }

    return {
      applicationId: Number(row.applicationId),
    }
  }
}
