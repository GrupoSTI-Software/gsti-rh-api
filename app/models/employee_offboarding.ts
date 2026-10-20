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
 *           description: Fecha de baja (VLRH-H1792172854107); no agenda nada por sí sola
 *         employeeOffboardingPlannedModality:
 *           type: string
 *           maxLength: 120
 *           nullable: true
 *           description: Modalidad de la baja programada, etiqueta del catálogo; null = motivos por capturar
 *         employeeOffboardingPlannedType:
 *           type: string
 *           maxLength: 200
 *           nullable: true
 *           description: Tipo de la baja programada, etiqueta del catálogo; null = motivos por capturar
 *         employeeOffboardingStatus:
 *           type: string
 *           enum: [open, closed, cancelled]
 *           description: El cierre lo escribe USRH1786568279596; cancelled lo escribe la reactivación (VLRH-H1790812613830) o la cancelación de RH (VLRH-H1792172886315)
 *         employeeOffboardingOrigin:
 *           type: string
 *           enum: [scheduled, termination]
 *           description: Programado a mano o abierto en automático al dar de baja
 *         employeeOffboardingNotes:
 *           type: string
 *           nullable: true
 *         employeeOffboardingTerminationDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Copia de la fecha de baja al reactivar (VLRH-H1790812613829); null si nunca se reactivó
 *         employeeOffboardingTerminationModality:
 *           type: string
 *           nullable: true
 *           description: Copia de la modalidad de baja al reactivar
 *         employeeOffboardingTerminationType:
 *           type: string
 *           nullable: true
 *           description: Copia del tipo de baja al reactivar
 *         employeeOffboardingCancelledAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Cuándo se canceló el expediente, al deshacer la baja (VLRH-H1790812613830) o por decisión de RH (VLRH-H1792172886315)
 *         employeeOffboardingCancelledByUserId:
 *           type: number
 *           nullable: true
 *           description: Usuario que canceló el expediente, al reactivar al colaborador o al cancelar la baja programada
 *         employeeOffboardingCancellationNote:
 *           type: string
 *           maxLength: 1000
 *           nullable: true
 *           description: Motivo escrito por RH al cancelar la baja programada (VLRH-H1792172886315); null en las cancelaciones por reactivación. Solo viaja en el DTO de la ficha
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

  /**
   * Motivos de la baja programada (VLRH-H1792172854107): etiqueta visible del
   * catálogo `app/constants/employee_termination.ts`. Nulas = "motivos por capturar".
   */
  @column()
  declare employeeOffboardingPlannedModality: string | null

  @column()
  declare employeeOffboardingPlannedType: string | null

  @column()
  declare employeeOffboardingStatus: string

  @column()
  declare employeeOffboardingOrigin: string

  @column()
  declare employeeOffboardingNotes: string | null

  /**
   * Copia de los datos de la baja, escrita UNA vez al reactivar
   * (VLRH-H1790812613829, regla 5): reactivar limpia fecha, modalidad y tipo
   * del colaborador y el expediente dejaría de poder explicar su salida.
   * Nulas en expedientes previos y en los que nunca pasaron por una
   * reactivación. La fecha se escribe `yyyy-MM-dd`; el driver puede devolver
   * `Date` al leer: los lectores normalizan con `toCalendarIsoDate`.
   */
  @column()
  declare employeeOffboardingTerminationDate: string | null

  @column()
  declare employeeOffboardingTerminationModality: string | null

  @column()
  declare employeeOffboardingTerminationType: string | null

  @column()
  declare employeeOffboardingOpenedByUserId: number | null

  @column()
  declare employeeOffboardingClosedByUserId: number | null

  @column.dateTime()
  declare employeeOffboardingClosedAt: DateTime | null

  /**
   * Rastro de la cancelación (VLRH-H1790812613830, regla 4): separado del
   * cierre porque `reopen` limpia `closed_*` y son hechos distintos. Lo escribe
   * una sola vez la reactivación o la cancelación de RH (VLRH-H1792172886315);
   * `null` en todo expediente no cancelado.
   */
  @column.dateTime()
  declare employeeOffboardingCancelledAt: DateTime | null

  @column()
  declare employeeOffboardingCancelledByUserId: number | null

  /**
   * Motivo escrito por RH al cancelar la baja programada (VLRH-H1792172886315,
   * regla 3). `null` en las cancelaciones por reactivación: una nota no nula
   * distingue la cancelación de RH. Texto libre confidencial: solo viaja en el
   * DTO de la ficha, nunca en el listado ni en logs.
   */
  @column()
  declare employeeOffboardingCancellationNote: string | null

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
