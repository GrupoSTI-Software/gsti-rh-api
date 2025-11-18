import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeSupplie from './employee_supplie.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeSuppliesResponseContract:
 *       type: object
 *       properties:
 *         employeeSupplyResponseContractId:
 *           type: number
 *           description: Contract ID
 *         employeeSupplyId:
 *           type: number
 *           description: Employee supply ID
 *         employeeSupplyResponseContractUuid:
 *           type: string
 *           description: Unique UUID for this contract (multiple employee supplies can share the same UUID)
 *         employeeSupplyResponseContractFile:
 *           type: string
 *           description: URL of the contract file in S3
 *         employeeSupplyResponseContractDigitalSignature:
 *           type: string
 *           nullable: true
 *           description: URL of the digital signature file (PNG) in S3 (optional)
 *         employeeSupplyResponseContractCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the contract was created
 *         employeeSupplyResponseContractUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the contract was last updated
 *         employeeSupplyResponseContractDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the contract was soft-deleted
 *       example:
 *         employeeSupplyResponseContractId: 1
 *         employeeSupplyId: 1
 *         employeeSupplyResponseContractUuid: '550e8400-e29b-41d4-a716-446655440000'
 *         employeeSupplyResponseContractFile: 'https://s3.example.com/file.pdf'
 *         employeeSupplyResponseContractDigitalSignature: 'https://s3.example.com/signature.png'
 *         employeeSupplyResponseContractCreatedAt: '2025-02-12T12:00:00Z'
 *         employeeSupplyResponseContractUpdatedAt: '2025-02-12T13:00:00Z'
 *         employeeSupplyResponseContractDeletedAt: null
 */
export default class EmployeeSuppliesResponseContract extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeSupplyResponseContractId: number

  @column()
  declare employeeSupplyId: number

  @column()
  declare employeeSupplyResponseContractUuid: string

  @column()
  declare employeeSupplyResponseContractFile: string

  @column()
  declare employeeSupplyResponseContractDigitalSignature: string | null

  @belongsTo(() => EmployeeSupplie, {
    foreignKey: 'employeeSupplyId',
  })
  declare employeeSupply: BelongsTo<typeof EmployeeSupplie>

  @column.dateTime({ autoCreate: true })
  declare employeeSupplyResponseContractCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeSupplyResponseContractUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_supply_response_contract_deleted_at' })
  declare deletedAt: DateTime | null
}
