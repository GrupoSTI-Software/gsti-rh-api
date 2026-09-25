import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import * as relations from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Employee from './employee.js'
import ExceptionType from './exception_type.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ExceptionRequest:
 *       type: object
 *       properties:
 *         exceptionRequestId:
 *           type: number
 *           description: Exception request ID
 *         employeeId:
 *           type: number
 *           nullable: false
 *           description: ID of the employee associated with the exception request
 *         exceptionTypeId:
 *           type: number
 *           nullable: false
 *           description: ID of the exception type associated with the exception request
 *         requestedDate:
 *           type: string
 *           format: date
 *           description: Date of the exception request
 *         exceptionRequestDescription:
 *           type: string
 *           description: Description of the exception request
 *         exceptionRequestCheckInTime:
 *           type: string
 *           format: time
 *           description: Time check in
 *           nullable: true
 *         exceptionRequestCheckOutTime:
 *           type: string
 *           format: time
 *           description: Time check out
 *           nullable: true
 *         exceptionRequestRhRead:
 *           type: number
 *           description: Read by RH
 *         exceptionRequestGerencialRead:
 *           type: number
 *           description: Read by Gerencial
 *         userId:
 *           type: number
 *           nullable: false
 *           description: User Id who creates it
 *         exceptionRequestCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the exception reques was created
 *         exceptionRequestUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the exception requeswas last updated
 *         exceptionRequestDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the exception reques was soft-deleted
 *       example:
 *         exceptionRequestId: 1
 *         employeeId: 1
 *         exceptionTypeId: 1
 *         requestedDate: '2024-12-06'
 *         exceptionRequestDescription: "Employee was absent from work"
 *         exceptionRequestCheckInTime: '07:00:00'
 *         exceptionRequestCheckOutTime: '21:00:00'
 *         userId: 1
 *         exceptionRequestCreatedAt: '2024-06-20T12:00:00Z'
 *         exceptionRequestUpdatedAt: '2024-06-20T13:00:00Z'
 *         exceptionRequestDeletedAt: null
 */

export default class ExceptionRequest extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  exceptionRequestId!: number

  /**
   * Lote con el que nacio la solicitud. Un permiso de varios dias crea una fila
   * por dia y todas comparten este valor: sirve para avisar una sola vez al
   * aprobador y para que el comprobante se vea en todos los dias pedidos.
   *
   * No es una unidad de resolucion: autorizar y rechazar siguen siendo actos
   * sobre una fila. NULL en las solicitudes anteriores a la columna.
   */
  @column()
  declare exceptionRequestBatchId: string | null

  @column()
  employeeId!: number

  /**
   * Empresa dueña de la solicitud.
   *
   * La tabla no la tenía: el aislamiento entre clientes dependía de que cada
   * consulta escribiera a mano `whereIn('employee_id', scopedEmployeeIds())`, y
   * ese corte falla en silencio —no revienta, devuelve de más— en cuanto una
   * ruta nace fuera de `businessScope()`. Con la marca propia, el mixin aplica
   * el filtro en toda consulta del modelo y deja de depender de la memoria de
   * quien escribe la siguiente query.
   */
  @column()
  declare businessUnitId: number

  /**
   * Resuelve la empresa desde el empleado dueño.
   *
   * La solicitud pertenece a la empresa del colaborador, no a la que tenga
   * activa quien la registra: Recursos Humanos puede levantarla desde el
   * backoffice y el expediente sigue siendo el del colaborador.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: ExceptionRequest) {
    if (instance.businessUnitId) return

    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  exceptionTypeId!: number

  @column()
  exceptionRequestStatus!: 'pending' | 'accepted' | 'refused'

  @column()
  exceptionRequestDescription?: string

  /**
   * Nota con la que la empresa resolvio la solicitud. Es la voz de la empresa y
   * nunca sustituye a `exceptionRequestDescription`, que es la del empleado.
   */
  @column()
  declare exceptionRequestResolutionNote: string | null

  /** Usuario que resolvio. NULL en las resueltas antes de la HU-1. */
  @column()
  declare resolvedByUserId: number | null

  /** Momento de la resolucion. NULL mientras siga pendiente. */
  @column.dateTime()
  declare exceptionRequestResolvedAt: DateTime | null

  @column()
  exceptionRequestCheckInTime!: string | null

  @column()
  exceptionRequestCheckOutTime!: string | null

  @column()
  exceptionRequestPeriodInHours!: number | null

  @column()
  declare requestedDate: DateTime<true> | DateTime<false> | string | Date

  @column()
  exceptionRequestRhRead!: number // 0: No leído, 1: Leído

  @column()
  exceptionRequestGerencialRead!: number // 0: No leído, 1: Leído

  @column()
  userId!: number

  @column.dateTime({ autoCreate: true })
  exceptionRequestCreatedAt!: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare exceptionRequestUpdatedAt: DateTime

  @column.dateTime({ columnName: 'exception_request_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'resolvedByUserId',
  })
  declare resolvedByUser: relations.BelongsTo<typeof User>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    }
  })
  employee!: relations.BelongsTo<typeof Employee>

  @belongsTo(() => ExceptionType, {
    foreignKey: 'exceptionTypeId',
  })
  exceptionType!: relations.BelongsTo<typeof ExceptionType>

  @belongsTo(() => User, {
    foreignKey: 'userId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    },
  })
  user!: relations.BelongsTo<typeof User>
}
