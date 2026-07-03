import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import { ATTENTION_PROGRAM_ERROR_CODES } from '#constants/attention_program_error_codes'
import { AttentionProgramServiceError } from '#exceptions/attention_program_service_error'
import type {
  AttentionProgramActionCreateInput,
  AttentionProgramActionItem,
  AttentionProgramActionStatus,
  AttentionProgramActionUpdateInput,
} from '../interfaces/attention_program_interface.js'

type ProgramScopeRow = {
  attentionProgramId: number | string
  businessUnitId: number | string
  regulationId: number | string
  status: 'borrador' | 'vigente' | 'cerrado'
}

type AttentionProgramActionRow = {
  attentionProgramActionId: number | string
  attentionProgramId: number | string
  psychosocialDimensionId: number | string
  psychosocialDimensionCode: string
  psychosocialDimensionNameKey: string
  attentionActionLevelId: number | string
  attentionActionLevelCode: string
  attentionActionLevelNameKey: string
  target: string
  description: string
  startDate: string | Date
  endDate: string | Date
  progress: string
  evaluation: string
  responsible: string
  status: AttentionProgramActionStatus
  createdAt: string | Date | null
  updatedAt: string | Date | null
}

export default class AttentionProgramActionService {
  async listActions(
    attentionProgramId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramActionItem[]> {
    await this.getProgramInScopeOrFail(attentionProgramId, allowedBusinessUnitIds, i18n)

    const rows = (await db
      .from('attention_program_actions as apa')
      .innerJoin(
        'psychosocial_dimensions as pd',
        'pd.psychosocial_dimension_id',
        'apa.psychosocial_dimension_id'
      )
      .innerJoin(
        'attention_action_levels as aal',
        'aal.attention_action_level_id',
        'apa.attention_action_level_id'
      )
      .where('apa.attention_program_id', attentionProgramId)
      .whereNull('apa.attention_program_action_deleted_at')
      .whereNull('pd.psychosocial_dimension_deleted_at')
      .whereNull('aal.attention_action_level_deleted_at')
      .orderBy('apa.attention_program_action_created_at', 'desc')
      .select(
        'apa.attention_program_action_id as attentionProgramActionId',
        'apa.attention_program_id as attentionProgramId',
        'apa.psychosocial_dimension_id as psychosocialDimensionId',
        'pd.psychosocial_dimension_code as psychosocialDimensionCode',
        'pd.psychosocial_dimension_name_key as psychosocialDimensionNameKey',
        'apa.attention_action_level_id as attentionActionLevelId',
        'aal.attention_action_level_code as attentionActionLevelCode',
        'aal.attention_action_level_name_key as attentionActionLevelNameKey',
        'apa.attention_program_action_target as target',
        'apa.attention_program_action_description as description',
        'apa.attention_program_action_start_date as startDate',
        'apa.attention_program_action_end_date as endDate',
        'apa.attention_program_action_progress as progress',
        'apa.attention_program_action_evaluation as evaluation',
        'apa.attention_program_action_responsible as responsible',
        'apa.attention_program_action_status as status',
        'apa.attention_program_action_created_at as createdAt',
        'apa.attention_program_action_updated_at as updatedAt'
      )) as AttentionProgramActionRow[]

    return rows.map((row) => this.serializeAction(row))
  }

  async store(
    attentionProgramId: number,
    input: AttentionProgramActionCreateInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramActionItem> {
    const program = await this.getProgramInScopeOrFail(attentionProgramId, allowedBusinessUnitIds, i18n)
    this.ensureProgramIsEditable(program, i18n)
    this.ensureRequiredFields(input, i18n)

    await this.ensureDimensionExists(
      input.psychosocialDimensionId!,
      Number(program.regulationId),
      i18n
    )
    await this.ensureActionLevelExists(
      input.attentionActionLevelId!,
      Number(program.regulationId),
      i18n
    )

    const normalizedStartDate = this.normalizeDateInput(input.startDate!, i18n)
    const normalizedEndDate = this.normalizeDateInput(input.endDate!, i18n)
    this.ensureDateRangeIsValid(normalizedStartDate, normalizedEndDate, i18n)

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const [newId] = await db.table('attention_program_actions').insert({
      attention_program_id: attentionProgramId,
      psychosocial_dimension_id: input.psychosocialDimensionId!,
      attention_action_level_id: input.attentionActionLevelId!,
      attention_program_action_target: input.target!.trim(),
      attention_program_action_description: input.description!.trim(),
      attention_program_action_start_date: normalizedStartDate,
      attention_program_action_end_date: normalizedEndDate,
      attention_program_action_progress: input.progress!.trim(),
      attention_program_action_evaluation: input.evaluation!.trim(),
      attention_program_action_responsible: input.responsible!.trim(),
      attention_program_action_status: input.status ?? 'pendiente',
      attention_program_action_created_at: now,
      attention_program_action_updated_at: now,
      attention_program_action_deleted_at: null,
    })

    return this.getActionById(attentionProgramId, Number(newId), allowedBusinessUnitIds, i18n)
  }

  async update(
    attentionProgramId: number,
    attentionProgramActionId: number,
    input: AttentionProgramActionUpdateInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramActionItem> {
    const program = await this.getProgramInScopeOrFail(attentionProgramId, allowedBusinessUnitIds, i18n)
    this.ensureProgramIsEditable(program, i18n)

    const current = await this.getActionById(
      attentionProgramId,
      attentionProgramActionId,
      allowedBusinessUnitIds,
      i18n
    )

    const psychosocialDimensionId = input.psychosocialDimensionId ?? current.psychosocialDimensionId
    const attentionActionLevelId = input.attentionActionLevelId ?? current.attentionActionLevelId
    const target = input.target?.trim() ?? current.target
    const description = input.description?.trim() ?? current.description
    const startDate = input.startDate ?? current.startDate
    const endDate = input.endDate ?? current.endDate
    const progress = input.progress?.trim() ?? current.progress
    const evaluation = input.evaluation?.trim() ?? current.evaluation
    const responsible = input.responsible?.trim() ?? current.responsible
    const status = input.status ?? current.status

    this.ensureRequiredFields(
      {
        psychosocialDimensionId,
        attentionActionLevelId,
        target,
        description,
        startDate,
        endDate,
        progress,
        evaluation,
        responsible,
      },
      i18n
    )

    await this.ensureDimensionExists(psychosocialDimensionId, Number(program.regulationId), i18n)
    await this.ensureActionLevelExists(attentionActionLevelId, Number(program.regulationId), i18n)

    const normalizedStartDate = this.normalizeDateInput(startDate, i18n)
    const normalizedEndDate = this.normalizeDateInput(endDate, i18n)
    this.ensureDateRangeIsValid(normalizedStartDate, normalizedEndDate, i18n)

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    await db
      .from('attention_program_actions')
      .where('attention_program_action_id', attentionProgramActionId)
      .where('attention_program_id', attentionProgramId)
      .whereNull('attention_program_action_deleted_at')
      .update({
        psychosocial_dimension_id: psychosocialDimensionId,
        attention_action_level_id: attentionActionLevelId,
        attention_program_action_target: target,
        attention_program_action_description: description,
        attention_program_action_start_date: normalizedStartDate,
        attention_program_action_end_date: normalizedEndDate,
        attention_program_action_progress: progress,
        attention_program_action_evaluation: evaluation,
        attention_program_action_responsible: responsible,
        attention_program_action_status: status,
        attention_program_action_updated_at: now,
      })

    return this.getActionById(attentionProgramId, attentionProgramActionId, allowedBusinessUnitIds, i18n)
  }

  async softDelete(
    attentionProgramId: number,
    attentionProgramActionId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<void> {
    const program = await this.getProgramInScopeOrFail(attentionProgramId, allowedBusinessUnitIds, i18n)
    this.ensureProgramIsEditable(program, i18n)

    await this.getActionById(attentionProgramId, attentionProgramActionId, allowedBusinessUnitIds, i18n)
    const now = DateTime.utc().toSQL({ includeOffset: false })!

    await db
      .from('attention_program_actions')
      .where('attention_program_action_id', attentionProgramActionId)
      .where('attention_program_id', attentionProgramId)
      .whereNull('attention_program_action_deleted_at')
      .update({
        attention_program_action_deleted_at: now,
        attention_program_action_updated_at: now,
      })
  }

  private async getProgramInScopeOrFail(
    attentionProgramId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<ProgramScopeRow> {
    const row = (await db
      .from('attention_programs')
      .where('attention_program_id', attentionProgramId)
      .whereNull('attention_program_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .select(
        'attention_program_id as attentionProgramId',
        'business_unit_id as businessUnitId',
        'regulation_id as regulationId',
        'attention_program_status as status'
      )
      .first()) as ProgramScopeRow | null

    if (!row) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.not_found_program',
          'Programa de atención no encontrado o fuera del alcance del usuario'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_PROGRAM,
        404,
        'programa-no-encontrado'
      )
    }

    return row
  }

  private async getActionById(
    attentionProgramId: number,
    attentionProgramActionId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramActionItem> {
    await this.getProgramInScopeOrFail(attentionProgramId, allowedBusinessUnitIds, i18n)

    const row = (await db
      .from('attention_program_actions as apa')
      .innerJoin(
        'psychosocial_dimensions as pd',
        'pd.psychosocial_dimension_id',
        'apa.psychosocial_dimension_id'
      )
      .innerJoin(
        'attention_action_levels as aal',
        'aal.attention_action_level_id',
        'apa.attention_action_level_id'
      )
      .where('apa.attention_program_id', attentionProgramId)
      .where('apa.attention_program_action_id', attentionProgramActionId)
      .whereNull('apa.attention_program_action_deleted_at')
      .whereNull('pd.psychosocial_dimension_deleted_at')
      .whereNull('aal.attention_action_level_deleted_at')
      .select(
        'apa.attention_program_action_id as attentionProgramActionId',
        'apa.attention_program_id as attentionProgramId',
        'apa.psychosocial_dimension_id as psychosocialDimensionId',
        'pd.psychosocial_dimension_code as psychosocialDimensionCode',
        'pd.psychosocial_dimension_name_key as psychosocialDimensionNameKey',
        'apa.attention_action_level_id as attentionActionLevelId',
        'aal.attention_action_level_code as attentionActionLevelCode',
        'aal.attention_action_level_name_key as attentionActionLevelNameKey',
        'apa.attention_program_action_target as target',
        'apa.attention_program_action_description as description',
        'apa.attention_program_action_start_date as startDate',
        'apa.attention_program_action_end_date as endDate',
        'apa.attention_program_action_progress as progress',
        'apa.attention_program_action_evaluation as evaluation',
        'apa.attention_program_action_responsible as responsible',
        'apa.attention_program_action_status as status',
        'apa.attention_program_action_created_at as createdAt',
        'apa.attention_program_action_updated_at as updatedAt'
      )
      .first()) as AttentionProgramActionRow | null

    if (!row) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program_action.action_not_found',
          'Acción de programa no encontrada o fuera del alcance del usuario'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.ACTION_NOT_FOUND,
        404,
        'accion-no-encontrada'
      )
    }

    return this.serializeAction(row)
  }

  private ensureProgramIsEditable(program: ProgramScopeRow, i18n?: I18n): void {
    if (program.status === 'cerrado') {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program_action.program_closed',
          'El Programa está cerrado y solo permite lectura'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.PROGRAM_CLOSED,
        409,
        'programa-cerrado'
      )
    }
  }

  private async ensureDimensionExists(
    psychosocialDimensionId: number,
    regulationId: number,
    i18n?: I18n
  ): Promise<void> {
    const exists = await db
      .from('psychosocial_dimensions')
      .where('psychosocial_dimension_id', psychosocialDimensionId)
      .where('regulation_id', regulationId)
      .whereNull('psychosocial_dimension_deleted_at')
      .first()

    if (!exists) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program_action.invalid_dimension',
          'La dimensión seleccionada no pertenece al catálogo oficial'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.INVALID_DIMENSION,
        422,
        'dimension-invalida'
      )
    }
  }

  private async ensureActionLevelExists(
    attentionActionLevelId: number,
    regulationId: number,
    i18n?: I18n
  ): Promise<void> {
    const exists = await db
      .from('attention_action_levels')
      .where('attention_action_level_id', attentionActionLevelId)
      .where('regulation_id', regulationId)
      .whereNull('attention_action_level_deleted_at')
      .first()

    if (!exists) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program_action.invalid_level',
          'El nivel seleccionado no pertenece al catálogo oficial'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.INVALID_LEVEL,
        422,
        'nivel-invalido'
      )
    }
  }

  private ensureRequiredFields(
    payload: {
      psychosocialDimensionId?: number
      attentionActionLevelId?: number
      target?: string
      description?: string
      startDate?: string | Date
      endDate?: string | Date
      progress?: string
      evaluation?: string
      responsible?: string
    },
    i18n?: I18n
  ): void {
    const missingField =
      (payload.psychosocialDimensionId ? null : 'psychosocialDimensionId') ??
      (payload.attentionActionLevelId ? null : 'attentionActionLevelId') ??
      (payload.target?.trim() ? null : 'target') ??
      (payload.description?.trim() ? null : 'description') ??
      (payload.startDate ? null : 'startDate') ??
      (payload.endDate ? null : 'endDate') ??
      (payload.progress?.trim() ? null : 'progress') ??
      (payload.evaluation?.trim() ? null : 'evaluation') ??
      (payload.responsible?.trim() ? null : 'responsible')

    if (!missingField) return

    const baseMessage = this.translate(
      i18n,
      'nom035.attention_program_action.action_incomplete',
      'Acción de programa incompleta'
    )
    throw new AttentionProgramServiceError(
      baseMessage,
      ATTENTION_PROGRAM_ERROR_CODES.ACTION_INCOMPLETE,
      422,
      'accion-incompleta',
      `Campo faltante: ${missingField}`
    )
  }

  private ensureDateRangeIsValid(startDate: string, endDate: string, i18n?: I18n): void {
    const start = DateTime.fromISO(startDate)
    const end = DateTime.fromISO(endDate)
    if (!start.isValid || !end.isValid) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.val_input',
          'Datos inválidos para la acción del programa'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
        400,
        'datos-invalidos',
        'Las fechas deben tener un formato válido'
      )
    }

    if (end < start) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program_action.action_incomplete',
          'Acción de programa incompleta'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.ACTION_INCOMPLETE,
        422,
        'accion-incompleta',
        'La fecha de fin no puede ser menor que la fecha de inicio'
      )
    }
  }

  private normalizeDateInput(value: string | Date, i18n?: I18n): string {
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate() as string

    const isoDate = DateTime.fromISO(value)
    if (isoDate.isValid) return isoDate.toISODate() as string

    const sqlDate = DateTime.fromSQL(value)
    if (sqlDate.isValid) return sqlDate.toISODate() as string

    throw new AttentionProgramServiceError(
      this.translate(
        i18n,
        'nom035.attention_program.val_input',
        'Datos inválidos para la acción del programa'
      ),
      ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
      400,
      'datos-invalidos',
      'Las fechas deben tener un formato válido'
    )
  }

  private serializeAction(row: AttentionProgramActionRow): AttentionProgramActionItem {
    return {
      attentionProgramActionId: Number(row.attentionProgramActionId),
      attentionProgramId: Number(row.attentionProgramId),
      psychosocialDimensionId: Number(row.psychosocialDimensionId),
      psychosocialDimensionCode: String(row.psychosocialDimensionCode),
      psychosocialDimensionNameKey: String(row.psychosocialDimensionNameKey),
      attentionActionLevelId: Number(row.attentionActionLevelId),
      attentionActionLevelCode: String(row.attentionActionLevelCode),
      attentionActionLevelNameKey: String(row.attentionActionLevelNameKey),
      target: String(row.target),
      description: String(row.description),
      startDate: this.toIsoDate(row.startDate) ?? DateTime.utc().toISODate()!,
      endDate: this.toIsoDate(row.endDate) ?? DateTime.utc().toISODate()!,
      progress: String(row.progress),
      evaluation: String(row.evaluation),
      responsible: String(row.responsible),
      status: row.status,
      createdAt: this.toIsoUtc(row.createdAt) ?? DateTime.utc().toISO()!,
      updatedAt: this.toIsoUtc(row.updatedAt) ?? DateTime.utc().toISO()!,
    }
  }

  private toIsoDate(value: string | Date): string | null {
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()
    const sqlDate = DateTime.fromSQL(String(value), { zone: 'utc' })
    if (sqlDate.isValid) return sqlDate.toISODate()
    const isoDate = DateTime.fromISO(String(value), { zone: 'utc' })
    if (isoDate.isValid) return isoDate.toISODate()
    return null
  }

  private toIsoUtc(value: string | Date | null): string | null {
    if (!value) return null
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISO()
    const sqlDate = DateTime.fromSQL(value, { zone: 'utc' })
    if (sqlDate.isValid) return sqlDate.toISO()
    const isoDate = DateTime.fromISO(value, { zone: 'utc' })
    if (isoDate.isValid) return isoDate.toISO()
    return null
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }
}
