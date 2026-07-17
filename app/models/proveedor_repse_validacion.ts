import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import ProveedorRepse from '#models/proveedor_repse'
import User from '#models/user'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

export type ProveedorRepseValidacionEstatus = 'vigente' | 'no_vigente'

/**
 * @swagger
 * components:
 *   schemas:
 *     ProveedorRepseValidacion:
 *       type: object
 *       properties:
 *         proveedorRepseValidacionId:
 *           type: integer
 *         proveedorRepseId:
 *           type: integer
 *         businessUnitId:
 *           type: integer
 *         estatus:
 *           type: string
 *           enum: [vigente, no_vigente]
 *         fecha:
 *           type: string
 *           format: date
 *         autorUserId:
 *           type: integer
 *         evidenciaNombreArchivo:
 *           type: string
 *         evidenciaMimeType:
 *           type: string
 *         evidenciaTamanoBytes:
 *           type: integer
 *         proveedorRepseValidacionCreatedAt:
 *           type: string
 *           format: date-time
 */
export default class ProveedorRepseValidacion extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'proveedor_repse_validaciones'

  @column({ isPrimary: true })
  declare proveedorRepseValidacionId: number

  @column({ columnName: 'proveedor_repse_id' })
  declare proveedorRepseId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'proveedor_repse_validacion_estatus' })
  declare estatus: ProveedorRepseValidacionEstatus

  @column.date({ columnName: 'proveedor_repse_validacion_fecha' })
  declare fecha: DateTime

  @column({ columnName: 'proveedor_repse_validacion_autor_user_id' })
  declare autorUserId: number

  @column({ columnName: 'proveedor_repse_validacion_evidencia_nombre_archivo' })
  declare evidenciaNombreArchivo: string

  @column({ columnName: 'proveedor_repse_validacion_evidencia_storage_key' })
  declare evidenciaStorageKey: string

  @column({ columnName: 'proveedor_repse_validacion_evidencia_mime_type' })
  declare evidenciaMimeType: string

  @column({ columnName: 'proveedor_repse_validacion_evidencia_tamano_bytes' })
  declare evidenciaTamanoBytes: number

  @column.dateTime({
    columnName: 'proveedor_repse_validacion_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @belongsTo(() => ProveedorRepse, {
    foreignKey: 'proveedorRepseId',
    localKey: 'proveedorRepseId',
  })
  declare proveedor: BelongsTo<typeof ProveedorRepse>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, {
    foreignKey: 'autorUserId',
    localKey: 'userId',
  })
  declare autor: BelongsTo<typeof User>
}
