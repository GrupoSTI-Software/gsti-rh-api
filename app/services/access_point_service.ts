import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import { AccessPointFilterSearchInterface } from '../interfaces/access_point_filter_search_interface.js'
import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import { LogAccessPoint } from '../interfaces/MongoDB/log_access_point.js'
import { LogStore } from '#models/MongoDB/log_store'
import Employee from '#models/employee'
import AccessPointEmployee from '#models/access_point_employee'
import type { ModelPaginatorContract } from '@adonisjs/lucid/types/model'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { AdmsError } from '#exceptions/adms_error'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import type { AccessPointScopePort } from '#modules/access-point/sharing/access_point_scope.port'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import { sharingViewOf } from '#modules/access-point/sharing/access_point_sharing_view'
import { redactCatalogForGuest } from '#modules/access-point/sharing/access_point_guest_redaction'

export default class AccessPointService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(
    i18n: I18n,
    private readonly scope: AccessPointScopePort = new AccessPointScopeRepositoryMysql(),
    /** Candado de la fila del aparato: el mismo que toman el alta, el envio y la revocacion. */
    private readonly deviceLock: Pick<EmployeeSyncRepository, 'inDeviceTransaction'> =
      new EmployeeSyncRepositoryMysql()
  ) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  static assertBusinessUnitAllowed(businessUnitId: number, allowedBusinessUnitIds: number[]): void {
    if (allowedBusinessUnitIds.length === 0 || !allowedBusinessUnitIds.includes(businessUnitId)) {
      const error = Object.assign(new Error('Empresa no permitida'), {
        title: 'Empresa no permitida',
        detail: 'El punto de acceso no puede crearse en una empresa distinta a la activa',
        key: 'empresa-no-permitida',
        httpStatus: 400,
      })
      throw error
    }
  }

  async index(filters: AccessPointFilterSearchInterface) {
    const selectedColumns = [
      'access_point_id',
      'access_point_name',
      'business_unit_id',
      'access_point_active',
      'access_point_serial_number',
      'access_point_device_name',
      'access_point_ip',
      'access_point_mac',
      'access_point_firmware',
      'access_point_platform',
      'access_point_status',
      'access_point_last_connection',
      'access_point_created_at',
    ]
    // Propios mas los compartidos con la empresa (VLRH-P0065, 6). El mixin de
    // tenant solo deja pasar las empresas del alcance, y la responsable de un
    // aparato compartido no esta ahi: por eso corre sin scope, con el alcance
    // de la peticion aplicado a mano. Todo se cierra dentro del bypass.
    const visible = filters.allowedBusinessUnitIds.includes(filters.businessUnitId)
    const sharedIds = visible ? await this.scope.sharedWith(filters.businessUnitId) : []
    return TenantContext.runUnscoped(
      () =>
        AccessPoint.query()
          .where((scope) => {
            if (!visible) {
              scope.whereRaw('1 = 0')
              return
            }
            scope
              .where('business_unit_id', filters.businessUnitId)
              .orWhereIn('access_point_id', sharedIds)
          })
          .whereNull('access_point_deleted_at')
          .if(filters.search, (query) => {
            query.whereRaw('UPPER(access_point_name) LIKE ?', [
              `%${filters.search!.toUpperCase()}%`,
            ])
          })
          .select(selectedColumns)
          .preload('businessUnit')
          .orderBy('access_point_created_at', 'asc')
          .paginate(filters.page, filters.limit),
      TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
    )
  }

  /**
   * La pagina serializada con el rol de la empresa sobre cada checador
   * (`sharedRole`, `sharedWith`, `sharedBy`), calculado por lote.
   */
  async serializeWithSharing(
    page: ModelPaginatorContract<AccessPoint>,
    viewerBusinessUnitIds: number[]
  ) {
    const rows = page.all()
    const views = await sharingViewOf(rows, viewerBusinessUnitIds)
    const serialized = page.serialize()
    return {
      ...serialized,
      data: serialized.data.map((row, index) => {
        const view = views.get(rows[index].accessPointId)
        return { ...redactCatalogForGuest(row, view), ...(view ?? {}) }
      }),
    }
  }

  async create(accessPoint: AccessPoint) {
    const newAccessPoint = new AccessPoint()
    newAccessPoint.accessPointName = accessPoint.accessPointName
    newAccessPoint.businessUnitId = accessPoint.businessUnitId
    newAccessPoint.accessPointActive = accessPoint.accessPointActive ?? 0
    newAccessPoint.accessPointSerialNumber = accessPoint.accessPointSerialNumber ?? null
    newAccessPoint.accessPointDeviceName = accessPoint.accessPointDeviceName ?? null
    newAccessPoint.accessPointIp = accessPoint.accessPointIp ?? null
    newAccessPoint.accessPointMac = accessPoint.accessPointMac ?? null
    newAccessPoint.accessPointFirmware = accessPoint.accessPointFirmware ?? null
    newAccessPoint.accessPointPlatform = accessPoint.accessPointPlatform ?? null
    newAccessPoint.accessPointStatus = accessPoint.accessPointStatus ?? 0
    newAccessPoint.accessPointLastConnection = accessPoint.accessPointLastConnection ?? null
    await newAccessPoint.save()
    await newAccessPoint.load('businessUnit')
    return newAccessPoint
  }

  async update(currentAccessPoint: AccessPoint, accessPoint: AccessPoint) {
    currentAccessPoint.accessPointName = accessPoint.accessPointName
    currentAccessPoint.businessUnitId = accessPoint.businessUnitId
    currentAccessPoint.accessPointActive = accessPoint.accessPointActive ?? 0
    currentAccessPoint.accessPointSerialNumber = accessPoint.accessPointSerialNumber ?? null
    currentAccessPoint.accessPointDeviceName = accessPoint.accessPointDeviceName ?? null
    currentAccessPoint.accessPointIp = accessPoint.accessPointIp ?? null
    currentAccessPoint.accessPointMac = accessPoint.accessPointMac ?? null
    currentAccessPoint.accessPointFirmware = accessPoint.accessPointFirmware ?? null
    currentAccessPoint.accessPointPlatform = accessPoint.accessPointPlatform ?? null
    currentAccessPoint.accessPointStatus = accessPoint.accessPointStatus ?? 0
    currentAccessPoint.accessPointLastConnection = accessPoint.accessPointLastConnection ?? null
    await currentAccessPoint.save()
    await currentAccessPoint.load('businessUnit')
    return currentAccessPoint
  }

  /**
   * Borra (logicamente) el checador si ninguna otra empresa depende de el.
   *
   * Con invitadas vivas no se borra: su personal quedaria en un aparato que
   * nadie administra y la invitacion colgando. Primero se revocan desde el
   * landlord, que encola sus bajas (VLRH-P0065, 3.2). Tampoco con una
   * ex-invitada cuyas bajas el aparato no ha confirmado (vinculos sin revocar
   * o comandos vivos): borrado el aparato, su cierre a mano ya no lo
   * encontraria. Es el alcance del canal, no el del Backoffice, y solo cuenta
   * si el aparato se compartio alguna vez: el vinculo de otra empresa en un
   * aparato nunca compartido no es de ninguna invitada.
   *
   * La decision y el borrado van en una transaccion que bloquea primero la
   * fila del aparato (A2-15). Un otorgamiento, un alta o un envio de la
   * invitada escriben filas que cuelgan de esa fila (llave foranea o su propio
   * `FOR UPDATE`): el que ya estaba en curso confirma antes de que aqui se lea
   * el alcance del canal, y el que llega despues espera al borrado. El alcance
   * se lee con el aparato ya bloqueado, asi que ve lo que confirmaron.
   *
   * @throws AdmsError 409 `checador-con-invitaciones-vivas`
   */
  async delete(currentAccessPoint: AccessPoint) {
    return this.deviceLock.inDeviceTransaction(currentAccessPoint.accessPointId, async (trx) => {
      const { participantBusinessUnitIds, everShared } = await this.scope.channelScope(
        currentAccessPoint.accessPointId,
        currentAccessPoint.businessUnitId,
        trx
      )
      if (everShared && participantBusinessUnitIds.length > 1) {
        throw new AdmsError(
          this.t('access_point_shared_live_title'),
          ADMS_ERROR_CODES.DEV_SHARED_LIVE,
          409,
          'checador-con-invitaciones-vivas',
          this.t('access_point_shared_live_message')
        )
      }
      currentAccessPoint.useTransaction(trx)
      await currentAccessPoint.delete()
      return currentAccessPoint
    })
  }

  /**
   * Ficha de un checador para la empresa de la peticion (VLRH-P0065, 6).
   *
   * Se lee sin el mixin, porque la responsable de un checador compartido no
   * esta en el alcance, y `allowedBusinessUnitIds` (el alcance de la
   * peticion) decide si se entrega: el propio o el compartido con alguna
   * empresa del alcance, con la regla unica `roleOf`. Alcance vacio o ajeno
   * devuelve `null` (el controlador responde 404).
   */
  async show(accessPointId: number, allowedBusinessUnitIds: number[] = []) {
    const selectedColumns = [
      'access_point_id',
      'access_point_name',
      'business_unit_id',
      'access_point_active',
      'access_point_serial_number',
      'access_point_device_name',
      'access_point_ip',
      'access_point_mac',
      'access_point_firmware',
      'access_point_platform',
      'access_point_status',
      'access_point_last_connection',
    ]
    // La invitada tambien consulta el aparato compartido (VLRH-P0065, 6): se
    // lee sin scope y se admite solo si el aparato es de su alcance o esta
    // compartido con alguna empresa de el.
    return TenantContext.runUnscoped(async () => {
      const accessPoint = await AccessPoint.query()
        .whereNull('access_point_deleted_at')
        .where('access_point_id', accessPointId)
        .select(selectedColumns)
        .preload('businessUnit')
        .first()
      if (!accessPoint) return null
      // La misma regla que `visibleTo`, sobre la lectura con las columnas de la ficha.
      return (await this.scope.roleOf(accessPoint, allowedBusinessUnitIds)) ? accessPoint : null
    }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)
  }

  /**
   * Busca un punto de acceso por serial_number (atributo único de referencia del dispositivo).
   */
  async findBySerialNumber(serialNumber: string): Promise<AccessPoint | null> {
    if (!serialNumber || String(serialNumber).trim() === '') {
      return null
    }
    const accessPoint = await AccessPoint.query()
      .whereNull('access_point_deleted_at')
      .where('access_point_serial_number', String(serialNumber).trim())
      .first()
    return accessPoint ?? null
  }

  async verifyInfo(accessPoint: AccessPoint) {
    const businessUnit = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', accessPoint.businessUnitId)
      .first()

    if (!businessUnit) {
      return {
        status: 404,
        type: 'warning',
        title: this.t('business_unit'),
        message: this.t('entity_was_not_found', { entity: this.t('business_unit') }),
        data: { ...accessPoint },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...accessPoint },
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logAccessPoint = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogAccessPoint
    return logAccessPoint
  }

  async saveActionOnLog(logAccessPoint: LogAccessPoint) {
    try {
      await LogStore.set('log_access_points', logAccessPoint)
    } catch (err) {}
  }

  async updateConnectionStatus(accessPointId: number, status: number, lastConnection: DateTime | null) {
    const currentAccessPoint = await AccessPoint.query()
      .whereNull('access_point_deleted_at')
      .where('access_point_id', accessPointId)
      .first()

    if (!currentAccessPoint) {
      return null
    }

    currentAccessPoint.accessPointStatus = status
    currentAccessPoint.accessPointLastConnection = lastConnection
    await currentAccessPoint.save()
    await currentAccessPoint.load('businessUnit')
    return currentAccessPoint
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  /**
   * Obtiene los puntos de acceso asignados a un empleado
   * @param employee - Empleado
   * @returns Puntos de acceso
   */
  async getAccessPointsByEmployee(employee: Employee) {
    const accessPoints = await AccessPointEmployee.query()
      .whereNull('access_point_employee_deleted_at')
      .where('employee_id', employee.employeeId)
      .preload('accessPoint')
    return accessPoints ?? null
  }
}
