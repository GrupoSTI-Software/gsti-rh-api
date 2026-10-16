import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CompetencyDescriptor from './competency_descriptor.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { TenantContext } from '#utils/tenant_context'

/**
 * @swagger
 * components:
 *   schemas:
 *      Competency:
 *        type: object
 *        properties:
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          competencyName:
 *            type: string
 *            description: Competency name
 *          competencyType:
 *            type: string
 *            enum: [technical, transversal]
 *            description: Competency type
 *          competencyCreatedAt:
 *            type: string
 *            description: Competency created at
 *          competencyUpdatedAt:
 *            type: string
 *            description: Competency updated at
 *          competencyDeletedAt:
 *            type: string
 *            description: Competency deleted at
 *          businessUnitId:
 *            type: number
 *            nullable: true
 *            description: Unidad de negocio dueña (NULL = competencia de plantilla, VLRH-H1792026427127)
 */

export default class Competency extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'competencies'

  @column({ isPrimary: true })
  declare competencyId: number

  @column()
  declare competencyName: string

  @column()
  declare competencyType: 'technical' | 'transversal'

  /**
   * Marca de pertenencia propia (VLRH-H1792026427127). NULL = competencia de
   * plantilla, invisible para cualquier cliente (sin `includeGlobal`).
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde la unidad activa del request (nunca del
   * payload). Catálogo privado por cliente — no hay padre empleado.
   */
  @beforeCreate()
  static assignBusinessUnitId(instance: Competency) {
    if (instance.businessUnitId) return
    const [businessUnitId] = TenantContext.getScope()
    if (!businessUnitId) {
      throw new Error(
        'No se pudo resolver la unidad de negocio: no hay unidad activa en el alcance'
      )
    }
    instance.businessUnitId = businessUnitId
  }

  @column.dateTime({ autoCreate: true })
  declare competencyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => CompetencyDescriptor, {
    foreignKey: 'competencyId',
  })
  declare competencyDescriptors: HasMany<typeof CompetencyDescriptor>
}
