import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import EmployeeOffboardingItem from './employee_offboarding_item.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeOffboarding:
 *       type: object
 *       properties:
 *         employeeOffboardingId:
 *           type: number
 *           description: Identificador del expediente de salida
 *         employeeId:
 *           type: number
 *           description: Colaborador dueño del expediente
 *         businessUnitId:
 *           type: number
 *           description: Empresa del colaborador, copiada al abrir el expediente
 *         employeeOffboardingPlannedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha tentativa de salida (solo referencia, no agenda nada)
 *         employeeOffboardingStatus:
 *           type: string
 *           enum: [open, closed]
 *           description: El cierre lo escribe USRH1786568279596
 *         employeeOffboardingOrigin:
 *           type: string
 *           enum: [scheduled, termination]
 *           description: Programado a mano o abierto en automático al dar de baja
 *         employeeOffboardingNotes:
 *           type: string
 *           nullable: true
 */
export default class EmployeeOffboarding extends compose(BaseModel, SoftDeletes) {
  /**
   * SIN `withBusinessUnitScope()` a propósito (§7 D1 de USRH1786568279587):
   * el mixin es no-op sin `TenantContext` activo y la apertura automática
   * corre desde caminos sin `businessScope()` (baja de piloto/sobrecargo).
   * El aislamiento por empresa va EXPLÍCITO en el adaptador del slice
   * (`whereIn('business_unit_id', allowed)`), nunca delegado al mixin.
   */
  static table = 'employee_offboardings'

  @column({ isPrimary: true })
  declare employeeOffboardingId: number

  @column()
  declare employeeId: number

  /** Snapshot de `employee.businessUnitId` al abrir; nunca de TenantContext (§7 D2). */
  @column()
  declare businessUnitId: number

  @column()
  declare employeeOffboardingPlannedDate: string | null

  @column()
  declare employeeOffboardingStatus: string

  @column()
  declare employeeOffboardingOrigin: string

  @column()
  declare employeeOffboardingNotes: string | null

  @column()
  declare employeeOffboardingOpenedByUserId: number | null

  @column()
  declare employeeOffboardingClosedByUserId: number | null

  @column.dateTime()
  declare employeeOffboardingClosedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare employeeOffboardingCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeOffboardingUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_offboarding_deleted_at' })
  declare deletedAt: DateTime | null

  /** El expediente sobrevive a la baja: el colaborador se resuelve con `withTrashed()` (§7 D3). */
  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare employee: BelongsTo<typeof Employee>

  @hasMany(() => EmployeeOffboardingItem, {
    foreignKey: 'employeeOffboardingId',
  })
  declare items: HasMany<typeof EmployeeOffboardingItem>
}
