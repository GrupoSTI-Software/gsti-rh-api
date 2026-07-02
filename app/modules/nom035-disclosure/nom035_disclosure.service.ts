import type { I18n } from '@adonisjs/i18n'
import type User from '#models/user'
import RoleService from '#services/role_service'
import QuestionnaireTabulationService from '#services/questionnaire_tabulation_service'
import type { TabulationResult } from '../../interfaces/questionnaire_tabulation.interface.js'
import {
  NOM035_DISCLOSURE_ERROR_CODES,
  type Nom035DisclosureErrorCode,
} from '#constants/nom035_disclosure_error_codes'
import { Nom035DisclosureServiceError } from '#exceptions/nom035_disclosure_service_error'
import type { Nom035DisclosureRepository } from './nom035_disclosure.repository.js'
import Nom035DisclosureRepositoryMysql from './nom035_disclosure.repository.mysql.js'
import type {
  Nom035DisclosureDto,
  Nom035DisclosureQueryDto,
  Nom035DisclosureAvailableDto,
} from './dto/nom035_disclosure.dto.js'

const K_ANONYMITY = 5

type DisclosureDeps = {
  repository?: Nom035DisclosureRepository
  roleService?: RoleService
  tabulationService?: QuestionnaireTabulationService
}

type BuildInput = {
  user: User
  query: Nom035DisclosureQueryDto
  allowedBusinessUnitIds: number[]
  i18n?: I18n
}

export default class Nom035DisclosureService {
  private repository: Nom035DisclosureRepository
  private roleService: RoleService
  private tabulationService: QuestionnaireTabulationService

  constructor(deps: DisclosureDeps = {}) {
    this.repository = deps.repository ?? new Nom035DisclosureRepositoryMysql()
    this.roleService = deps.roleService ?? new RoleService()
    this.tabulationService = deps.tabulationService ?? new QuestionnaireTabulationService()
  }

  async getDisclosure(input: BuildInput): Promise<Nom035DisclosureDto> {
    const { user, query, allowedBusinessUnitIds, i18n } = input

    const personId = Number(user.personId)
    if (!Number.isInteger(personId) || personId <= 0) {
      throw this.buildError(
        i18n,
        'nom035.disclosure.no_employee',
        'El usuario autenticado no tiene un empleado asociado',
        NOM035_DISCLOSURE_ERROR_CODES.NO_EMPLOYEE,
        422
      )
    }

    const employeeContext = await this.repository.findEmployeeContextByPerson(
      personId,
      allowedBusinessUnitIds
    )
    if (!employeeContext) {
      throw this.buildError(
        i18n,
        'nom035.disclosure.no_employee',
        'El usuario autenticado no tiene un empleado asociado',
        NOM035_DISCLOSURE_ERROR_CODES.NO_EMPLOYEE,
        422
      )
    }

    if (employeeContext.branchOfficeId === null) {
      throw this.buildError(
        i18n,
        'nom035.disclosure.no_branch',
        'El empleado no tiene centro de trabajo activo',
        NOM035_DISCLOSURE_ERROR_CODES.NO_BRANCH,
        422
      )
    }

    const canReadAll = await this.roleService.hasAccess(user.roleId, 'nom035-disclosure', 'read-all')
    const requestedBranchOfficeId = query.branchOfficeId
    const targetBranchOfficeId =
      canReadAll && requestedBranchOfficeId ? requestedBranchOfficeId : employeeContext.branchOfficeId

    const branchOffice = await this.repository.findBranchOfficeInScope(
      targetBranchOfficeId,
      allowedBusinessUnitIds
    )
    if (!branchOffice) {
      throw this.buildError(
        i18n,
        'nom035.disclosure.not_found',
        'Centro de trabajo no encontrado o fuera del alcance del usuario',
        NOM035_DISCLOSURE_ERROR_CODES.NOT_FOUND,
        404
      )
    }

    const latestRound = await this.repository.findLatestTabulatedRound(
      branchOffice.branchOfficeId,
      allowedBusinessUnitIds
    )

    if (!latestRound) {
      return {
        available: false,
        branchOfficeId: branchOffice.branchOfficeId,
        branchOfficeName: branchOffice.branchOfficeName,
      }
    }

    const aggregates = await this.tabulationService.getAggregates(
      latestRound.applicationId,
      allowedBusinessUnitIds,
      i18n
    )

    return this.applyKAnonymity(branchOffice.branchOfficeId, branchOffice.branchOfficeName, aggregates)
  }

  private applyKAnonymity(
    branchOfficeId: number,
    branchOfficeName: string,
    tabulation: TabulationResult
  ): Nom035DisclosureAvailableDto {
    return {
      available: true,
      branchOfficeId,
      branchOfficeName,
      applicationId: tabulation.applicationId,
      instrumentCode: tabulation.instrumentCode,
      respondersCount: tabulation.respondersCount,
      overall: tabulation.overall,
      categories: tabulation.categories.map((category) => ({
        code: category.code,
        score: category.respondersCount < K_ANONYMITY ? null : category.score,
        riskLevel: category.riskLevel,
        respondersCount: category.respondersCount,
        suppressed: category.respondersCount < K_ANONYMITY,
      })),
      domains: tabulation.domains.map((domain) => ({
        code: domain.code,
        categoryCode: domain.categoryCode,
        score: domain.respondersCount < K_ANONYMITY ? null : domain.score,
        riskLevel: domain.riskLevel,
        respondersCount: domain.respondersCount,
        suppressed: domain.respondersCount < K_ANONYMITY,
      })),
    }
  }

  private buildError(
    i18n: I18n | undefined,
    messageKey: string,
    fallbackMessage: string,
    errorCode: Nom035DisclosureErrorCode,
    httpStatus: number
  ): Nom035DisclosureServiceError {
    return new Nom035DisclosureServiceError(
      this.translate(i18n, messageKey, fallbackMessage),
      errorCode,
      httpStatus
    )
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    return i18n?.formatMessage(key) ?? fallback
  }
}
