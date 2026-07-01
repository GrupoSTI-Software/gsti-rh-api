import type { AttentionProgramStatus } from '#models/attention_program'

export interface AttentionProgramListFilters {
  status?: AttentionProgramStatus
  page?: number
  limit?: number
}

export type AttentionProgramActionStatus = 'pendiente' | 'en-curso' | 'cumplida'

export interface AttentionProgramCreateInput {
  year: number
  period?: string
  questionnaireApplicationId?: number
}

export interface AttentionProgramUpdateInput {
  period?: string
  status?: Extract<AttentionProgramStatus, 'borrador' | 'vigente'>
}

export interface AttentionProgramCatalogDimensionItem {
  psychosocialDimensionId: number
  code: string
  nameKey: string
  name: string
  ord: number
}

export interface AttentionProgramCatalogLevelItem {
  attentionActionLevelId: number
  code: string
  nameKey: string
  name: string
  order: number
}

export interface AttentionProgramCatalogResult {
  dimensions: AttentionProgramCatalogDimensionItem[]
  actionLevels: AttentionProgramCatalogLevelItem[]
}

export interface AttentionProgramListItem {
  attentionProgramId: number
  businessUnitId: number
  regulationId: number
  questionnaireApplicationId: number | null
  originApplication: AttentionProgramOriginApplicationItem | null
  year: number
  period: string | null
  status: AttentionProgramStatus
  actionCount: number
  createdAt: string
  updatedAt: string
}

export interface AttentionProgramOriginApplicationItem {
  questionnaireApplicationId: number
  folio: string
  branchOfficeName: string | null
  status: 'borrador' | 'en-curso' | 'cerrada'
  year: number
  period: string | null
}

export interface AttentionProgramListResult {
  meta: Record<string, unknown>
  data: AttentionProgramListItem[]
}

export interface AttentionProgramActionCreateInput {
  psychosocialDimensionId?: number
  attentionActionLevelId?: number
  target?: string
  description?: string
  startDate?: string | Date
  endDate?: string | Date
  progress?: string
  evaluation?: string
  responsible?: string
  status?: AttentionProgramActionStatus
}

export interface AttentionProgramActionUpdateInput {
  psychosocialDimensionId?: number
  attentionActionLevelId?: number
  target?: string
  description?: string
  startDate?: string | Date
  endDate?: string | Date
  progress?: string
  evaluation?: string
  responsible?: string
  status?: AttentionProgramActionStatus
}

export interface AttentionProgramActionItem {
  attentionProgramActionId: number
  attentionProgramId: number
  psychosocialDimensionId: number
  psychosocialDimensionCode: string
  psychosocialDimensionNameKey: string
  attentionActionLevelId: number
  attentionActionLevelCode: string
  attentionActionLevelNameKey: string
  target: string
  description: string
  startDate: string
  endDate: string
  progress: string
  evaluation: string
  responsible: string
  status: AttentionProgramActionStatus
  createdAt: string
  updatedAt: string
}
