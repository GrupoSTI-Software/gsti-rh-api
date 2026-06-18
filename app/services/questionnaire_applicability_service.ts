import { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import BranchOfficeService from '#services/branch_office_service'
import {
  QUESTIONNAIRE_APPLICABILITY_ERROR_CODES,
} from '#constants/questionnaire_applicability_error_codes'
import { QuestionnaireApplicabilityServiceError } from '#exceptions/questionnaire_applicability_service_error'
import type {
  ApplicableInstrument,
  QuestionnaireApplicabilityItem,
} from '../interfaces/questionnaire_applicability_interface.js'

export default class QuestionnaireApplicabilityService {
  static THRESHOLDS = {
    GUIDE_II_MIN: 16,
    GUIDE_III_MIN: 51,
  } as const

  static getApplicableInstrument(activeEmployees: number): ApplicableInstrument {
    if (activeEmployees >= this.THRESHOLDS.GUIDE_III_MIN) {
      return 'guide_iii'
    }

    if (activeEmployees >= this.THRESHOLDS.GUIDE_II_MIN) {
      return 'guide_ii'
    }

    return 'none'
  }

  private static buildApplicabilityItem(
    branchOfficeId: number,
    branchOfficeName: string,
    activeEmployees: number,
    i18n: I18n
  ): QuestionnaireApplicabilityItem {
    const applicableInstrument = this.getApplicableInstrument(activeEmployees)

    return {
      branchOfficeId,
      branchOfficeName,
      activeEmployees,
      applicableInstrument,
      note:
        applicableInstrument === 'none'
          ? i18n.formatMessage('nom035.questionnaire_applicability.none_note', {
              count: activeEmployees,
            })
          : null,
    }
  }

  private static async getActiveEmployeesCountByBranch(
    branchOfficeIds: number[]
  ): Promise<Map<number, number>> {
    if (branchOfficeIds.length === 0) {
      return new Map()
    }

    const rows = await db
      .from('employee_branch_offices as ebo')
      .innerJoin('employees as e', 'e.employee_id', 'ebo.employee_id')
      .whereIn('ebo.branch_office_id', branchOfficeIds)
      .where('ebo.employee_branch_office_active', 1)
      .whereNull('e.employee_deleted_at')
      .groupBy('ebo.branch_office_id')
      .select('ebo.branch_office_id as branchOfficeId')
      .countDistinct('ebo.employee_id as activeEmployees')

    const countMap = new Map<number, number>()
    for (const row of rows) {
      const branchOfficeId = Number((row as { branchOfficeId: number | string }).branchOfficeId)
      const activeEmployees = Number((row as { activeEmployees: number | string }).activeEmployees)
      countMap.set(branchOfficeId, activeEmployees)
    }
    return countMap
  }

  static async getByBusinessUnit(
    businessUnitId: number,
    i18n: I18n
  ): Promise<QuestionnaireApplicabilityItem[]> {
    const allowedIds: number[] = [] // await BranchOfficeService.getAllowedBusinessUnitIds()
    if (!allowedIds.includes(businessUnitId)) {
      throw new QuestionnaireApplicabilityServiceError(
        i18n.formatMessage('nom035.questionnaire_applicability.company_not_found'),
        QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.NOT_FOUND_COMPANY,
        404
      )
    }

    const branchOffices = await BranchOffice.query()
      .where('businessUnitId', businessUnitId)
      .whereNull('branch_office_deleted_at')
      .orderBy('branchOfficeName', 'asc')

    const countByBranch = await this.getActiveEmployeesCountByBranch(
      branchOffices.map((branch) => branch.branchOfficeId)
    )

    return branchOffices.map((branch) => {
      const activeEmployees = countByBranch.get(branch.branchOfficeId) ?? 0
      return this.buildApplicabilityItem(
        branch.branchOfficeId,
        branch.branchOfficeName,
        activeEmployees,
        i18n
      )
    })
  }

  static async getByBranchOffice(
    branchOfficeId: number,
    i18n: I18n
  ): Promise<QuestionnaireApplicabilityItem> {
    const allowedIds: number[] = [] // await BranchOfficeService.getAllowedBusinessUnitIds()
    const branchOffice = await BranchOffice.query()
      .where('branchOfficeId', branchOfficeId)
      .whereNull('branch_office_deleted_at')
      .first()

    if (!branchOffice || !allowedIds.includes(branchOffice.businessUnitId)) {
      throw new QuestionnaireApplicabilityServiceError(
        i18n.formatMessage('nom035.questionnaire_applicability.branch_not_found'),
        QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.NOT_FOUND_BRANCH,
        404
      )
    }

    const countByBranch = await this.getActiveEmployeesCountByBranch([branchOffice.branchOfficeId])
    const activeEmployees = countByBranch.get(branchOffice.branchOfficeId) ?? 0

    return this.buildApplicabilityItem(
      branchOffice.branchOfficeId,
      branchOffice.branchOfficeName,
      activeEmployees,
      i18n
    )
  }
}
