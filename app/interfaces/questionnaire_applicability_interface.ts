export type ApplicableInstrument = 'none' | 'guide_ii' | 'guide_iii'
export type LaunchBlockReason = 'NOT_APPLICABLE' | 'OPEN_ROUND_EXISTS' | null

export interface QuestionnaireApplicabilityItem {
  branchOfficeId: number
  branchOfficeName: string
  activeEmployees: number
  applicableInstrument: ApplicableInstrument
  canLaunch: boolean
  launchBlockReason: LaunchBlockReason
  blockingApplicationId: number | null
  note: string | null
}
