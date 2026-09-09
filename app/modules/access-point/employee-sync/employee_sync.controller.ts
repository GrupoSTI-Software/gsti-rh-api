import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import EmployeeBiometricSummaryService from '#modules/biometric-vault/device-biometrics/employee_biometric_summary.service'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
  resolveScopedEmployee,
} from '#modules/access-point/access_point_authorization'
import Employee from '#models/employee'
import AccessPointEmployee from '#models/access_point_employee'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import EmployeeSyncService from './employee_sync.service.js'
import { toEmployeeSyncDto } from './dto/employee_sync.dto.js'
import {
  toEmployeeAccessPointDto,
  type EmployeeAccessPointDto,
  type EmployeeAvailableAccessPointDto,
  type EmployeeBiometricSummaryDto,
  type EmployeeDevicesDto,
} from './dto/employee_access_point.dto.js'
import { statusOf } from '#modules/access-point/health/health.service'
import { TenantContext } from '#utils/tenant_context'
import db from '@adonisjs/lucid/services/db'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import AccessPoint from '#models/access_point'
import BiometricTemplate from '#models/biometric_template'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import { DateTime } from 'luxon'

const pairValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      employeeId: vine.number().positive(),
    }),
  })
)

const accessPointValidator = vine.compile(
  vine.object({ params: vine.object({ accessPointId: vine.number().positive() }) })
)

const employeeValidator = vine.compile(
  vine.object({ params: vine.object({ employeeId: vine.number().positive() }) })
)

const pinValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      employeeId: vine.number().positive(),
    }),
    pin: vine.string().trim().regex(/^\d{1,9}$/),
  })
)

/**
 * Alta, PIN y revocacion de un colaborador en un checador (spec ADMS 8).
 * Permiso: el de biometricos del colaborador, porque la operacion es sobre la
 * persona, no sobre el catalogo de equipos.
 */
export default class EmployeeSyncController {
  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/pin:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Fija o cambia el PIN del colaborador en el checador
   *     responses:
   *       200:
   *         description: Pivote actualizado en data.accessPointEmployee
   *       409:
   *         description: El PIN ya esta ocupado o en cuarentena (key pin-ocupado)
   */
  async setPin(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeAccessPoint
      )
      const payload = await request.validateUsing(pinValidator, {
        data: { params: request.params(), pin: request.input('pin') },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, payload.params.accessPointId)
      await resolveScopedEmployee(ctx, payload.params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.setPin({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: payload.params.employeeId,
        pin: payload.pin,
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_pin_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/employees:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Colaboradores dados de alta en el checador
   *     responses:
   *       200:
   *         description: Lista en data.employees
   *       404:
   *         description: El equipo no esta en el alcance
   */
  async listByAccessPoint(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(accessPointValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const status = request.input('status')
      const query = AccessPointEmployee.query().where(
        'access_point_id',
        accessPoint.accessPointId
      )
      if (typeof status === 'string' && status.length > 0) {
        query.where('access_point_employee_sync_status', status)
      }
      const pivots = await query.orderBy('access_point_employee_pin', 'asc').limit(500)

      return StandardResponseFormatter.success(
        response,
        pivots.map(toEmployeeSyncDto),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('access_point_employee_list_message'),
        200,
        'employees'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access-points:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Checadores del colaborador con su PIN y el estado del alta
   *     description: >
   *       La vuelta de `listByAccessPoint`: en que equipos esta la persona, con
   *       que numero y si el aparato ya confirmo el alta. Incluye el PIN que se
   *       propondria en un equipo nuevo y los biometricos resguardados.
   *     responses:
   *       200:
   *         description: Equipos en data.employeeDevices
   *       404:
   *         description: El colaborador no esta en el alcance
   */
  async listByEmployee(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBiometrics
      )
      const { params } = await request.validateUsing(employeeValidator, {
        data: { params: request.params() },
      })
      const employee = await resolveScopedEmployee(ctx, params.employeeId)

      /**
       * Se omiten los revocados: el aparato ya confirmo que esa persona no esta
       * ahi, y listarla junto a las altas vivas invita a operar sobre un
       * vinculo que no existe. El rastro queda en los eventos del pivote.
       */
      const pivots = await AccessPointEmployee.query()
        .where('employee_id', employee.employeeId)
        .whereNot(
          'access_point_employee_sync_status',
          ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
        )

      const accessPointIds = pivots.map((pivot) => pivot.accessPointId)
      const accessPoints =
        accessPointIds.length > 0
          ? await AccessPoint.query().whereIn('access_point_id', accessPointIds)
          : []
      const byId = new Map(accessPoints.map((row) => [row.accessPointId, row]))

      const now = DateTime.utc()
      const summaries = new EmployeeBiometricSummaryService()
      const rows: EmployeeAccessPointDto[] = []
      for (const pivot of pivots) {
        const accessPoint = byId.get(pivot.accessPointId)
        /** Un equipo dado de baja deja el pivote huerfano: no hay que pintarlo. */
        if (!accessPoint) continue
        /**
         * Se resuelve equipo por equipo a proposito: lo que la persona puede
         * usar en un aparato no se deduce de su expediente. Son pocas consultas
         * porque una persona esta en un puñado de checadores; si esa flota
         * crece, aqui es donde hay que agrupar.
         */
        const scoped = await summaries.of(employee.employeeId, accessPoint.accessPointId)
        /**
         * Cuenta lo confirmado y lo que el equipo ya acuso: la copia acusada
         * esta dentro del aparato aunque su prueba llegue despues, y negarla
         * mostraba "sin biometricos" en un checador que si tenia la huella.
         */
        const present = (state: string) => state === 'here' || state === 'sent'
        rows.push(
          toEmployeeAccessPointDto(
            pivot,
            accessPoint,
            now,
            {
              fingerprints: scoped.fingers.filter((finger) => present(finger.state)).length,
              faces: scoped.face.state !== null && present(scoped.face.state) ? 1 : 0,
            },
            scoped.withheldBy
          )
        )
      }
      rows.sort((a, b) => a.name.localeCompare(b.name))

      const payload: EmployeeDevicesDto = {
        employeeId: employee.employeeId,
        accessPoints: rows,
        available: await availableFor(
          ctx.businessUnitScope ?? [],
          new Set(rows.map((row) => row.accessPointId)),
          now
        ),
        biometrics: await countBiometrics(employee.employeeId),
      }

      return StandardResponseFormatter.success(
        response,
        payload,
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('access_point_employee_list_message'),
        200,
        'employeeDevices'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/send:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Encola el alta del colaborador en el checador
   *     responses:
   *       200:
   *         description: Pivote en data.accessPointEmployee
   *       422:
   *         description: El colaborador no tiene PIN (key pin-faltante)
   */
  async send(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeAccessPoint
      )
      const { params } = await request.validateUsing(pairValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      const employee = await resolveScopedEmployee(ctx, params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.send({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: employee.employeeId,
        employeeName: nameOf(employee),
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_send_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/revoke:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Pide el borrado del colaborador en el checador
   *     description: >
   *       Responde 202 porque la baja en el equipo no es inmediata: se encola y
   *       el PIN queda en cuarentena hasta que el aparato confirme.
   *     responses:
   *       202:
   *         description: Revocacion en curso en data.accessPointEmployee
   */
  async revoke(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.removeEmployeeAccessPoint
      )
      const { params } = await request.validateUsing(pairValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      await resolveScopedEmployee(ctx, params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.revoke({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: params.employeeId,
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_revoke_message'),
        202,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * Cierra a mano una baja que el equipo nunca confirmo.
   *
   * Existe para el aparato que no vuelve: reemplazado, reseteado o muerto. La
   * espera normal es correcta mientras haya un equipo al que preguntarle; sin
   * el, esa espera no se cierra sola y el vinculo queda colgado para siempre.
   *
   * Pide el mismo permiso que la baja: es la misma decision --sacar a alguien
   * de un checador-- tomada sin la confirmacion del aparato.
   */
  async forceRevoke(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.removeEmployeeAccessPoint
      )
      const { params } = await request.validateUsing(pairValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      await resolveScopedEmployee(ctx, params.employeeId)

      const reason = String(request.input('reason') ?? '').trim()

      const service = new EmployeeSyncService()
      const pivot = await service.forceRevoke({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: params.employeeId,
        reason: reason.length > 0 ? reason.slice(0, 200) : 'el equipo no responde',
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_force_revoke_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /** Un colaborador de otra empresa se comporta como inexistente. */
}

/** Nombre para la pantalla del equipo. El formateador lo recorta a 24. */
function nameOf(employee: Employee): string {
  return [employee.employeeFirstName, employee.employeeLastName]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .trim()
}


/** Biometricos resguardados del colaborador, por modalidad. */
async function countBiometrics(employeeId: number): Promise<EmployeeBiometricSummaryDto> {
  const rows = await BiometricTemplate.query()
    .where('employee_id', employeeId)
    .select('biometric_template_bio_type')
    .count('* as total')
    .groupBy('biometric_template_bio_type')

  const byType = new Map<number, number>()
  for (const row of rows) {
    byType.set(Number(row.biometricTemplateBioType), Number(row.$extras.total))
  }

  return {
    fingerprints: byType.get(BIO_TYPE.FINGERPRINT) ?? 0,
    faces: byType.get(BIO_TYPE.FACE) ?? 0,
    palms: byType.get(BIO_TYPE.PALM) ?? 0,
  }
}

/** El catalogo de modelos es de plataforma, no de una empresa. */
const MODEL_UNSCOPED_REASON =
  'alta en checador: el catalogo de modelos es de plataforma, no de una empresa'

/**
 * Checadores del alcance donde la persona todavia no esta.
 *
 * Viajan con la ficha y no en su propia llamada porque se usan en el mismo
 * momento -- al abrir el alta -- y porque asi el permiso es uno solo: el de la
 * pestaña de biometricos, no el del catalogo de equipos.
 */
async function availableFor(
  businessUnitIds: number[],
  taken: Set<number>,
  now: DateTime
): Promise<EmployeeAvailableAccessPointDto[]> {
  if (businessUnitIds.length === 0) return []

  const accessPoints = await AccessPoint.query()
    .whereIn('business_unit_id', businessUnitIds)
    .where('access_point_active', 1)
    .orderBy('access_point_name', 'asc')

  const candidates = accessPoints.filter((row) => !taken.has(row.accessPointId))
  if (candidates.length === 0) return []

  const models = await modelsOf(candidates)

  return candidates.map((accessPoint) => ({
    accessPointId: accessPoint.accessPointId,
    name: accessPoint.accessPointName,
    deviceName: accessPoint.accessPointDeviceName ?? null,
    serialNumber: accessPoint.accessPointSerialNumber,
    connection: statusOf(accessPoint.accessPointLastConnection, now),
    model: models.get(accessPoint.accessPointId) ?? null,
  }))
}

/** Modelo de catalogo por equipo, en una sola consulta. */
async function modelsOf(
  accessPoints: AccessPoint[]
): Promise<Map<number, EmployeeAvailableAccessPointDto['model']>> {
  const byDeviceId = new Map<number, number>()
  for (const accessPoint of accessPoints) {
    if (accessPoint.platformDeviceId) {
      byDeviceId.set(accessPoint.platformDeviceId, accessPoint.accessPointId)
    }
  }
  if (byDeviceId.size === 0) return new Map()

  const rows = await TenantContext.runUnscoped(
    () =>
      db
        .from('platform_devices as d')
        .innerJoin(
          'platform_device_models as m',
          'm.platform_device_model_id',
          'd.platform_device_model_id'
        )
        .whereIn('d.platform_device_id', [...byDeviceId.keys()])
        .select(
          'd.platform_device_id',
          'm.platform_device_model_id',
          'm.platform_device_model_brand',
          'm.platform_device_model_name',
          'm.platform_device_model_slug'
        ),
    MODEL_UNSCOPED_REASON
  )

  const result = new Map<number, EmployeeAvailableAccessPointDto['model']>()
  for (const row of rows) {
    const accessPointId = byDeviceId.get(Number(row.platform_device_id))
    if (!accessPointId) continue
    result.set(accessPointId, {
      platformDeviceModelId: Number(row.platform_device_model_id),
      brand: String(row.platform_device_model_brand),
      name: String(row.platform_device_model_name),
      slug: String(row.platform_device_model_slug),
    })
  }
  return result
}
