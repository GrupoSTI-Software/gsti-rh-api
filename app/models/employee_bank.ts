/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import Bank from './bank.js'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeBank:
 *        type: object
 *        properties:
 *          employeeBankId:
 *            type: number
 *            description: Employee bank id
 *          employeeBankAccountClabe:
 *            type: string
 *            description: Employee bank account clabe
 *          employeeBankAccountClabeLastNumbers:
 *            type: string
 *            description: Employee bank account clabe last 4 numbers
 *          employeeBankAccountNumber:
 *            type: string
 *            description: Employee bank account number
 *          employeeBankAccountNumberLastNumbers:
 *            type: string
 *            description: Employee bank account number last 4 numbers
 *          employeeBankAccountCardNumber:
 *            type: string
 *            description: Employee bank account card number
 *          employeeBankAccountCardNumberLastNumbers:
 *            type: string
 *            description: Employee bank account card number last 4 numbers
 *          employeeBankAccountType:
 *            type: string
 *            description: Employee bank account type
 *          employeeBankAccountCurrencyType:
 *            type: string
 *            description: Employee bank account currency type
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          bankId:
 *            type: number
 *            description: Bank id
 *          employeeBankCreatedAt:
 *            type: string
 *          employeeBankUpdatedAt:
 *            type: string
 *          employeeBankDeletedAt:
 *            type: string
 *
 */

export default class EmployeeBank extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeBankId: number

  /**
   * CLABE interbancaria — cifrada AES-256-CBC en reposo (LFPDPPP, dato financiero).
   * El ciphertext no se usa en cláusulas WHERE; los últimos números se conservan en
   * `employeeBankAccountClabeLastNumbers` para presentación parcial.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serialize: (value: string | null) => maskSensitiveValue(value, 'financiero'),
  })
  declare employeeBankAccountClabe: string

  @column()
  declare employeeBankAccountClabeLastNumbers: string

  /**
   * Número de cuenta bancaria — cifrado AES-256-CBC en reposo (LFPDPPP, dato financiero).
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serialize: (value: string | null) => maskSensitiveValue(value, 'financiero'),
  })
  declare employeeBankAccountNumber: string

  @column()
  declare employeeBankAccountNumberLastNumbers: string

  /**
   * Número de tarjeta — cifrado AES-256-CBC en reposo (LFPDPPP, dato financiero).
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serialize: (value: string | null) => maskSensitiveValue(value, 'financiero'),
  })
  declare employeeBankAccountCardNumber: string

  @column()
  declare employeeBankAccountCardNumberLastNumbers: string

  @column()
  declare employeeBankAccountType: string

  @column()
  declare employeeBankAccountCurrencyType: string

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare bankId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeBank) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeBankCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBankUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_bank_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Bank, {
    foreignKey: 'bankId',
  })
  declare bank: BelongsTo<typeof Bank>
}
