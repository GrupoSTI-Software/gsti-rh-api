import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BranchOffice from './branch_office.js'
import Shift from './shift.js'

/**
 * Cuota de plantilla por sucursal (sitio de servicio) y turno.
 *
 * @swagger
 * components:
 *   schemas:
 *     BranchOfficeShiftQuotaShiftRef:
 *       type: object
 *       required: [shiftId, shiftName]
 *       properties:
 *         shiftId:
 *           type: integer
 *         shiftName:
 *           type: string
 *     BranchOfficeShiftQuotaItem:
 *       type: object
 *       required: [branchOfficeShiftQuotaId, shift, required, minimum]
 *       properties:
 *         branchOfficeShiftQuotaId:
 *           type: integer
 *         shift:
 *           $ref: '#/components/schemas/BranchOfficeShiftQuotaShiftRef'
 *         required:
 *           type: integer
 *           minimum: 1
 *           description: Plantilla requerida para operación normal
 *         minimum:
 *           type: integer
 *           minimum: 1
 *           description: Mínimo crítico tolerable
 *     BranchOfficeShiftQuotaInputItem:
 *       type: object
 *       required: [shiftId, required, minimum]
 *       properties:
 *         shiftId:
 *           type: integer
 *           minimum: 1
 *         required:
 *           type: integer
 *           minimum: 1
 *         minimum:
 *           type: integer
 *           minimum: 1
 *     BranchOfficeShiftQuotasReplace:
 *       type: object
 *       properties:
 *         quotas:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BranchOfficeShiftQuotaInputItem'
 */
export default class BranchOfficeShiftQuota extends BaseModel {
  static table = 'branch_office_shift_quotas'

  @column({ isPrimary: true })
  declare branchOfficeShiftQuotaId: number

  @column()
  declare branchOfficeId: number

  @column()
  declare shiftId: number

  @column()
  declare branchOfficeShiftQuotaRequired: number

  @column()
  declare branchOfficeShiftQuotaMinimum: number

  @column.dateTime({ autoCreate: true })
  declare branchOfficeShiftQuotaCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare branchOfficeShiftQuotaUpdatedAt: DateTime

  @belongsTo(() => BranchOffice, {
    foreignKey: 'branchOfficeId',
    onQuery: (query) => {
      query.whereNull('branch_office_deleted_at')
    },
  })
  declare branchOffice: BelongsTo<typeof BranchOffice>

  @belongsTo(() => Shift, {
    foreignKey: 'shiftId',
    onQuery: (query) => {
      query.whereNull('shift_deleted_at')
    },
  })
  declare shift: BelongsTo<typeof Shift>
}
