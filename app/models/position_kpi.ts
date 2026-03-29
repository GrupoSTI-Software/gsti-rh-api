import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from './position.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionKpi:
 *        type: object
 *        properties:
 *          positionKpiId:
 *            type: number
 *            description: Position kpi id
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionKpiName:
 *            type: string
 *            description: Position kpi name
 *          positionKpiMin:
 *            type: number
 *            description: Position kpi min
 *          positionKpiMax:
 *            type: number
 *            description: Position kpi max
 *          positionKpiIdeal:
 *            type: string
 *            description: Position kpi ideal
 *          positionKpiScale:
 *            type: string
 *            enum: ['mayor-es-mejor', 'menor-es-mejor', 'si', 'no']
 *            description: Escala del KPI del puesto
 *          positionKpiType:
 *            type: enum
 *            enum: ['numerico', 'porcentaje', 'dinero', 'booleano']
 *            description: Position kpi type
 *          positionKpiFrequency:
 *            type: enum
 *            enum: ['sin-especificar', 'diario', 'semanal', 'cada-2-semanas', 'mensual', 'trimestral', 'semestral', 'anual']
 *            description: Position kpi frequency
 *          positionKpiDurationDays:
 *            type: number
 *            description: Position kpi duration days
 *          positionKpiStartDay:
 *            type: number
 *            description: Position kpi start day
 *          positionKpiCreatedAt:
 *            type: string
 *            description: Position kpi created at
 *          positionKpiUpdatedAt:
 *            type: string
 *            description: Position kpi updated at
 *          positionKpiDeletedAt:
 *            type: string
 *            description: Position kpi deleted at
 */

export default class PositionKpi extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionKpiId: number

  @column()
  declare positionId: number

  @column()
  declare positionKpiName: string

  @column()
  declare positionKpiMin: number

  @column()
  declare positionKpiMax: number

  @column()
  declare positionKpiIdeal: string

  @column()
  declare positionKpiScale: string

  @column()
  declare positionKpiType: string

  @column()
  declare positionKpiFrequency: string

  @column()
  declare positionKpiDurationDays: number

  @column()
  declare positionKpiStartDay: number

  @column.dateTime({ autoCreate: true })
  declare positionKpiCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionKpiUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_kpi_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>
}
