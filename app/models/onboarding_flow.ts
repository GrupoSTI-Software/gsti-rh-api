import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import OnboardingStep from '#models/onboarding_step'

/**
 * @swagger
 * components:
 *   schemas:
 *     OnboardingFlow:
 *       type: object
 *       properties:
 *         onboardingFlowId:
 *           type: integer
 *           description: Identificador único del flujo de onboarding
 *         onboardingFlowSlug:
 *           type: string
 *           description: Slug único de la intención (ej. attendance, vacations, records)
 *         onboardingFlowName:
 *           type: string
 *           description: Nombre legible de la intención
 *         onboardingFlowDescription:
 *           type: string
 *           nullable: true
 *         onboardingFlowActive:
 *           type: boolean
 *         onboardingFlowOrder:
 *           type: integer
 */
export default class OnboardingFlow extends compose(BaseModel, SoftDeletes) {
  static table = 'onboarding_flows'

  @column({ isPrimary: true })
  declare onboardingFlowId: number

  @column()
  declare onboardingFlowSlug: string

  @column()
  declare onboardingFlowName: string

  @column()
  declare onboardingFlowDescription: string | null

  @column({ consume: (v: number | boolean) => Boolean(v) })
  declare onboardingFlowActive: boolean

  @column()
  declare onboardingFlowOrder: number

  @column.dateTime({ autoCreate: true, columnName: 'onboarding_flow_created_at' })
  declare onboardingFlowCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'onboarding_flow_updated_at' })
  declare onboardingFlowUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'onboarding_flow_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => OnboardingStep, { foreignKey: 'onboardingFlowId' })
  declare steps: HasMany<typeof OnboardingStep>
}
