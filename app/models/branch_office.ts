import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import EmployeeBranchOffice from './employee_branch_office.js'
import BranchOfficeShiftQuota from './branch_office_shift_quota.js'
import EmpresaContratante from './empresa_contratante.js'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import BusinessUnit from './business_unit.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     BranchOffice:
 *       type: object
 *       properties:
 *         branchOfficeId:
 *           type: number
 *           description: Identificador de la sucursal
 *         businessUnitId:
 *           type: number
 *           description: Identificador de la unidad de negocio
 *         branchOfficeName:
 *           type: string
 *           description: Nombre de la sucursal
 *         branchOfficeSlug:
 *           type: string
 *           description: Slug único por unidad de negocio derivado del nombre
 *         branchOfficeLocationAddress:
 *           type: string
 *           nullable: true
 *           description: Ubicación o delimitación; típicamente GeoJSON RFC 7946 como string (p. ej. FeatureCollection con LineString/Polygon), mismo criterio que zonePolygon en zonas
 *         branchOfficeIdealTemplateCount:
 *           type: integer
 *           nullable: true
 *           description: Número ideal de plantillas en la sucursal
 *         branchOfficeMinActiveEmployeesPerShift:
 *           type: integer
 *           nullable: true
 *           description: Número mínimo de empleados activos por turno
 *         branchOfficeCreatedAt:
 *           type: string
 *           format: date-time
 *         branchOfficeUpdatedAt:
 *           type: string
 *           format: date-time
 *         branchOfficeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         empresaContratanteId:
 *           type: integer
 *           nullable: true
 *           description: Empresa contratante ligada (sitio de servicio REPSE)
 *         empresaContratante:
 *           type: object
 *           nullable: true
 *           properties:
 *             empresaContratanteId:
 *               type: integer
 *             razonSocial:
 *               type: string
 */
export default class BranchOffice extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare branchOfficeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare branchOfficeName: string

  @column()
  declare branchOfficeSlug: string

  @column()
  declare branchOfficeLocationAddress: string | null

  @column()
  declare branchOfficeIdealTemplateCount: number | null

  @column()
  declare branchOfficeMinActiveEmployeesPerShift: number | null

  @column()
  declare empresaContratanteId: number | null

  @column.dateTime({ autoCreate: true })
  declare branchOfficeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare branchOfficeUpdatedAt: DateTime

  static softDeleteColumn = 'branch_office_deleted_at'

  @column.dateTime({ columnName: 'branch_office_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    onQuery: (query) => {
      query.whereNull('business_unit_deleted_at')
    },
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => EmpresaContratante, {
    foreignKey: 'empresaContratanteId',
    localKey: 'empresaContratanteId',
    onQuery: (query) => {
      query.whereNull('empresa_contratante_deleted_at')
    },
  })
  declare empresaContratante: BelongsTo<typeof EmpresaContratante>

  @hasMany(() => EmployeeBranchOffice, {
    foreignKey: 'branchOfficeId',
  })
  declare employeeBranchOffices: HasMany<typeof EmployeeBranchOffice>

  @hasMany(() => BranchOfficeShiftQuota, {
    foreignKey: 'branchOfficeId',
  })
  declare shiftQuotas: HasMany<typeof BranchOfficeShiftQuota>
}
