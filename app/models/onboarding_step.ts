import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import OnboardingFlow from '#models/onboarding_flow'

/**
 * @swagger
 * components:
 *   schemas:
 *     OnboardingStep:
 *       type: object
 *       properties:
 *         onboardingStepId:
 *           type: integer
 *         onboardingFlowId:
 *           type: integer
 *           nullable: true
 *           description: NULL = paso común; FK = paso de la rama de esa intención
 *         onboardingStepSlug:
 *           type: string
 *         onboardingStepName:
 *           type: string
 *         onboardingStepOrder:
 *           type: integer
 *         onboardingStepIsSkippable:
 *           type: boolean
 *         onboardingStepCompletionHint:
 *           type: string
 *           nullable: true
 *           description: Señal informativa para que el consumidor detecte si el paso ya se cumplió
 *         onboardingStepActive:
 *           type: boolean
 */
export default class OnboardingStep extends compose(BaseModel, SoftDeletes) {
  static table = 'onboarding_steps'

  @column({ isPrimary: true })
  declare onboardingStepId: number

  /** NULL = paso del tronco común; valor = paso de la rama de esa intención. */
  @column()
  declare onboardingFlowId: number | null

  @column()
  declare onboardingStepSlug: string

  @column()
  declare onboardingStepName: string

  @column()
  declare onboardingStepDescription: string | null

  @column()
  declare onboardingStepOrder: number

  @column({ consume: (v: number | boolean) => Boolean(v) })
  declare onboardingStepIsSkippable: boolean

  /** Clave informativa que el consumidor evalúa para detectar cumplimiento; el motor no la evalúa. */
  @column()
  declare onboardingStepCompletionHint: string | null

  @column({ consume: (v: number | boolean) => Boolean(v) })
  declare onboardingStepActive: boolean

  @column.dateTime({ autoCreate: true, columnName: 'onboarding_step_created_at' })
  declare onboardingStepCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'onboarding_step_updated_at' })
  declare onboardingStepUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'onboarding_step_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => OnboardingFlow, { foreignKey: 'onboardingFlowId' })
  declare flow: BelongsTo<typeof OnboardingFlow>
}
