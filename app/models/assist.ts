import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, beforeSave, column, computed } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { AssistCreateFrom } from '#constants/assist_origin'
import { resolveAssistBusinessUnitId } from '#helpers/assist_business_unit_guard'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { computeAssistNaturalKey } from '#utils/assist_natural_key'
import {
  assistArrivalDelayInSeconds,
  isAssistArrivalDeferred,
} from '#modules/assist-ingestion/assist_ingestion.constants'

/**
 * @swagger
 * components:
 *   schemas:
 *     Assist:
 *      type: object
 *      properties:
 *        assistId:
 *          type: integer
 *        assistEmpCode:
 *          type: string
 *        assistTerminalSn:
 *          type: string
 *        assistTerminalAlias:
 *          type: string
 *        assistAreaAlias:
 *          type: string
 *        assistLongitude:
 *          type: number
 *          format: float
 *        assistLatitude:
 *          type: number
 *          format: float
 *        assistPrecision:
 *          type: number
 *          format: float
 *        assistUploadTime:
 *          type: string
 *          format: date-time
 *        assistEmpId:
 *          type: integer
 *        businessUnitId:
 *          type: integer
 *          nullable: true
 *          description: Empresa dueña de la checada (USRH1786566437097).
 *        assistTerminalId:
 *          type: integer
 *        assistSyncId:
 *          type: integer
 *        assistPunchTime:
 *          type: string
 *          format: date-time
 *        assistPunchTimeUtc:
 *          type: string
 *          format: date-time
 *        assistPunchTimeOrigin:
 *          type: string
 *          format: date-time
 *        assistActive:
 *          type: integer
 *        assistType:
 *          type: string
 *          enum: [check, eatin, eatout]
 *        assistOrigin:
 *          type: string
 *          nullable: true
 *          description: Procedencia (self-service, admin-capture, sync). NULL = no determinado.
 *        assistCreatedByUserId:
 *          type: integer
 *          nullable: true
 *          description: Usuario captor en captura administrativa.
 *        assistUsed:
 *          type: integer
 *        assistCreatedAt:
 *          type: string
 *          format: date-time
 *        assistUpdatedAt:
 *          type: string
 *          format: date-time
 *        assistDeleteAt:
 *          type: string
 *          format: date-time
 */
export default class Assist extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare assistId: number

  @column()
  declare assistUuid: string | null

  /** Marca de pertenencia propia (USRH1786566437097). */
  @column()
  declare businessUnitId: number | null

  @column()
  declare assistEmpCode: string

  @column()
  declare assistTerminalSn: string | null

  @column()
  declare assistTerminalAlias: string

  @column()
  declare assistAreaAlias: string

  @column()
  declare assistLongitude: number

  @column()
  declare assistLatitude: number

  @column()
  declare assistPrecision: number

  @column.dateTime({ autoCreate: true })
  declare assistUploadTime: DateTime

  @column()
  declare assistEmpId: number

  @column()
  declare assistTerminalId: number | null

  @column()
  declare assistSyncId: number

  @column()
  declare assistActive: number

  @column()
  declare assistType: string

  /** Procedencia del registro. NULL = origen no determinado (históricos). */
  @column()
  declare assistOrigin: AssistCreateFrom | null

  /** Usuario que capturó el registro. NULL en autoservicio, sync e históricos. Sin FK. */
  @column()
  declare assistCreatedByUserId: number | null

  /** Llave natural SHA-256. NULL en históricos pendientes de backfill o duplicados. */
  @column({ serializeAs: null })
  declare assistNaturalKey: string | null

  /**
   * Resuelve `businessUnitId` desde la unidad activa del request.
   * Fail-closed: sin contexto resoluble lanza `AssistError`.
   *
   * **Invariante:** un `businessUnitId` explícito NUNCA se pisa. Es el contrato con
   * el motor de ingesta (`#modules/assist-ingestion`), que resuelve la empresa por su
   * cuenta porque también corre fuera de un request —el canal del checador físico
   * llegará sin sesión— y no puede apoyarse en el alcance activo.
   *
   * El rechazo lo emite `resolveAssistBusinessUnitId`, compartido con ese módulo,
   * para que los dos caminos respondan el mismo `{title, detail, key, code}`.
   */
  @beforeCreate()
  static assignBusinessUnitId(instance: Assist) {
    if (instance.businessUnitId) return
    instance.businessUnitId = resolveAssistBusinessUnitId()
  }

  /**
   * Calcula la llave natural en `@beforeSave` (no `@beforeCreate`): el sync BioTime
   * muta código, instante y terminal sobre filas ya persistidas.
   */
  @beforeSave()
  static assignNaturalKey(instance: Assist) {
    if (!instance.businessUnitId || !instance.assistPunchTimeUtc) return

    instance.assistPunchTimeUtc = instance.assistPunchTimeUtc.toUTC()
    instance.assistNaturalKey = computeAssistNaturalKey({
      businessUnitId: instance.businessUnitId,
      assistEmpCode: instance.assistEmpCode,
      assistPunchTimeUtc: instance.assistPunchTimeUtc,
      assistTerminalSn: instance.assistTerminalSn,
    })
  }

  @column.dateTime({ autoCreate: true })
  declare assistPunchTime: DateTime

  @column.dateTime({ autoCreate: true })
  declare assistPunchTimeUtc: DateTime

  @column.dateTime({ autoCreate: true })
  declare assistPunchTimeOrigin: DateTime

  /**
   * Testigo de llegada: el único dato que dice cuándo entró la checada al sistema.
   *
   * **Invariante:** lo llena `autoCreate` con el reloj del servidor y nadie más.
   * No se acepta del cliente, no se copia de la petición, no lleva `autoUpdate` y
   * ninguna rama de reenvío lo escribe. `assist_upload_time` y
   * `assist_punch_time_origin` no sirven para esto: el alta les asigna el mismo
   * instante del marcaje.
   */
  @column.dateTime({ autoCreate: true })
  declare assistCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare assistUpdatedAt: DateTime

  @column.dateTime({ columnName: 'assist_deleted_at' })
  declare deletedAt: DateTime | null

  /**
   * Segundos entre el marcaje y su llegada al servidor. `null` cuando la fila se
   * consultó sin alguno de los dos instantes. Derivado: no se guarda.
   */
  @computed()
  get arrivalDelaySeconds(): number | null {
    if (!this.assistPunchTimeUtc || !this.assistCreatedAt) return null
    return assistArrivalDelayInSeconds(this.assistPunchTimeUtc, this.assistCreatedAt)
  }

  /**
   * La checada llegó diferida: el equipo que la registró estuvo sin conexión.
   * Se deduce de los dos instantes que ya se guardan; no hay dato nuevo.
   */
  @computed()
  get isDeferredArrival(): boolean | null {
    if (!this.assistPunchTimeUtc || !this.assistCreatedAt) return null
    return isAssistArrivalDeferred(this.assistPunchTimeUtc, this.assistCreatedAt)
  }
}
