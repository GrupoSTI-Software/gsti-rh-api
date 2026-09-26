import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import Address from './address.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeAddress:
 *        type: object
 *        properties:
 *          employeeAddressId:
 *            type: number
 *            description: Employee address id
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          addressId:
 *            type: number
 *            description: Address id
 *          employeeAddressCreatedAt:
 *            type: string
 *          employeeAddressUpdatedAt:
 *            type: string
 *          employeeAddressDeletedAt:
 *            type: string
 *
 */
export default class EmployeeAddress extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'employee_address'

  @column({ isPrimary: true })
  declare employeeAddressId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare addressId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). Ver #mixins/resolve_parent_business_unit_id. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeAddress) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeAddressCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeAddressUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_address_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => Address, {
    foreignKey: 'addressId',
  })
  declare address: BelongsTo<typeof Address>
}
