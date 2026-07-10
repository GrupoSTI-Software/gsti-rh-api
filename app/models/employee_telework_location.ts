import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { TeleworkLocationType } from '#constants/employee_telework_location_error_codes'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeTeleworkLocation:
 *       type: object
 *       properties:
 *         employeeTeleworkLocationId:
 *           type: number
 *           description: Identificador único del lugar de teletrabajo
 *         employeeId:
 *           type: number
 *           description: Id del empleado teletrabajador (1:N)
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio (aislamiento por empresa)
 *         employeeTeleworkLocationType:
 *           type: string
 *           enum: [home, coworking, other]
 *           description: Tipo de lugar (domicilio, coworking u otro)
 *         employeeTeleworkLocationStreet:
 *           type: string
 *           description: Calle del lugar de teletrabajo
 *         employeeTeleworkLocationExternalNumber:
 *           type: string
 *           description: Número exterior
 *         employeeTeleworkLocationInternalNumber:
 *           type: string
 *           description: Número interior
 *         employeeTeleworkLocationSettlement:
 *           type: string
 *           description: Colonia o asentamiento
 *         employeeTeleworkLocationCity:
 *           type: string
 *           description: Ciudad o municipio
 *         employeeTeleworkLocationState:
 *           type: string
 *           description: Estado
 *         employeeTeleworkLocationCountry:
 *           type: string
 *           description: País
 *         employeeTeleworkLocationZipcode:
 *           type: string
 *           description: Código postal
 *         employeeTeleworkLocationIsFixedAgreed:
 *           type: boolean
 *           description: Fijeza 5.1.2 — es el lugar fijo pactado (máx. uno activo por empleado)
 *         employeeTeleworkLocationHasInternet:
 *           type: boolean
 *           description: Conectividad 5.1.1 — cuenta con internet
 *         employeeTeleworkLocationHasAdequateEquipment:
 *           type: boolean
 *           description: Conectividad 5.1.1 — cuenta con equipo adecuado
 *         employeeTeleworkLocationConnectivityNotes:
 *           type: string
 *           description: Notas adicionales de conectividad
 *         employeeTeleworkLocationActive:
 *           type: boolean
 *           description: Estado activo del lugar
 *         employeeTeleworkLocationCreatedAt:
 *           type: string
 *           description: Fecha de creación
 *         employeeTeleworkLocationUpdatedAt:
 *           type: string
 *           description: Fecha de última actualización
 *         employeeTeleworkLocationDeletedAt:
 *           type: string
 *           description: Fecha de baja lógica
 */
export default class EmployeeTeleworkLocation extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static readonly table = 'employee_telework_locations'

  @column({ isPrimary: true })
  declare employeeTeleworkLocationId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeTeleworkLocationType: TeleworkLocationType

  @column()
  declare employeeTeleworkLocationStreet: string

  @column()
  declare employeeTeleworkLocationExternalNumber: string | null

  @column()
  declare employeeTeleworkLocationInternalNumber: string | null

  @column()
  declare employeeTeleworkLocationSettlement: string | null

  @column()
  declare employeeTeleworkLocationCity: string

  @column()
  declare employeeTeleworkLocationState: string

  @column()
  declare employeeTeleworkLocationCountry: string

  @column()
  declare employeeTeleworkLocationZipcode: string | null

  @column({
    consume: (value: unknown) => Boolean(value),
  })
  declare employeeTeleworkLocationIsFixedAgreed: boolean

  @column({
    consume: (value: unknown) => Boolean(value),
  })
  declare employeeTeleworkLocationHasInternet: boolean

  @column({
    consume: (value: unknown) => Boolean(value),
  })
  declare employeeTeleworkLocationHasAdequateEquipment: boolean

  @column()
  declare employeeTeleworkLocationConnectivityNotes: string | null

  @column({
    consume: (value: unknown) => Boolean(value),
  })
  declare employeeTeleworkLocationActive: boolean

  @column.dateTime({ autoCreate: true })
  declare employeeTeleworkLocationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeTeleworkLocationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_telework_location_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
