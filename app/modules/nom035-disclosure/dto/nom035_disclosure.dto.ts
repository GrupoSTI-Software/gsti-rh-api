import type { RiskLevel } from '../../../interfaces/questionnaire_tabulation.interface.js'

export interface Nom035DisclosureQueryDto {
  branchOfficeId?: number
}

export interface Nom035DisclosureCategoryDto {
  code: string
  score: number | null
  riskLevel: RiskLevel | null
  respondersCount: number
  suppressed: boolean
}

export interface Nom035DisclosureDomainDto {
  code: string
  categoryCode: string
  score: number | null
  riskLevel: RiskLevel | null
  respondersCount: number
  suppressed: boolean
}

export interface Nom035DisclosureAvailableDto {
  available: true
  branchOfficeId: number
  applicationId: number
  instrumentCode: string
  respondersCount: number
  overall: {
    score: number
    riskLevel: RiskLevel | null
  }
  categories: Nom035DisclosureCategoryDto[]
  domains: Nom035DisclosureDomainDto[]
}

export interface Nom035DisclosureUnavailableDto {
  available: false
  branchOfficeId: number
}

export type Nom035DisclosureDto = Nom035DisclosureAvailableDto | Nom035DisclosureUnavailableDto

export interface EmployeeContextDto {
  employeeId: number
  branchOfficeId: number | null
}

export interface BranchOfficeScopeDto {
  branchOfficeId: number
  businessUnitId: number
}

export interface BranchOfficeOptionDto extends BranchOfficeScopeDto {
  branchOfficeName: string
}

export interface TabulatedRoundRefDto {
  applicationId: number
}
