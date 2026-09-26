import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeOffboarding from './employee_offboarding.js'
import OffboardingConcept from './offboarding_concept.js'
import EmployeeSupplie from './employee_supplie.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeOffboardingItem:
 *       type: object
 *       properties:
 *         employeeOffboardingItemId:
 *           type: number
 *           description: Identificador del pendiente
 *         employeeOffboardingId:
 *           type: number
 *           description: Expediente al que pertenece
 *         offboardingConceptId:
 *           type: number
 *           nullable: true
 *           description: Concepto de origen; null cuando el pendiente derivó de un activo
 *         employeeSupplyId:
 *           type: number
 *           nullable: true
 *           description: Insumo de origen; null cuando el pendiente derivó de un concepto
 *         employeeOffboardingItemName:
 *           type: string
 *           description: Snapshot del nombre del concepto o del activo al generarse
 *         employeeOffboardingItemStatus:
 *           type: string
 *           enum: [pending, completed]
 *           description: El cumplimiento lo escribe USRH1786568279590
 */
export default class EmployeeOffboardingItem extends compose(BaseModel, SoftDeletes) {
  /** SIN `withBusinessUnitScope()`: mismo motivo que `EmployeeOffboarding` (§7 D1). */
  static table = 'employee_offboarding_items'

  @column({ isPrimary: true })
  declare employeeOffboardingItemId: number

  @column()
  declare employeeOffboardingId: number

  @column()
  declare offboardingConceptId: number | null

  @column()
  declare employeeSupplyId: number | null

  /** Snapshot irreversible por diseño (§7 D9): el nombre mostrado siempre sale de aquí. */
  @column()
  declare employeeOffboardingItemName: string

  @column()
  declare employeeOffboardingItemStatus: string

  /** DECIMAL(12,2); algunos drivers lo devuelven como string — normalizar con Number() en el DTO. */
  @column()
  declare employeeOffboardingItemAmount: number | string | null

  @column()
  declare employeeOffboardingItemNote: string | null

  @column.dateTime()
  declare employeeOffboardingItemCompletedAt: DateTime | null

  @column()
  declare employeeOffboardingItemCompletedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeOffboardingItemCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeOffboardingItemUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_offboarding_item_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeOffboarding, {
    foreignKey: 'employeeOffboardingId',
  })
  declare offboarding: BelongsTo<typeof EmployeeOffboarding>

  /**
   * El concepto se resuelve con `withTrashed()` (§7 D8): puede haberse
   * eliminado lógicamente después de generar el pendiente y sus banderas
   * `requiresEvidence`/`allowsAmount` siguen gobernando este pendiente.
   */
  @belongsTo(() => OffboardingConcept, {
    foreignKey: 'offboardingConceptId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare concept: BelongsTo<typeof OffboardingConcept>

  @belongsTo(() => EmployeeSupplie, {
    foreignKey: 'employeeSupplyId',
  })
  declare employeeSupply: BelongsTo<typeof EmployeeSupplie>
}
