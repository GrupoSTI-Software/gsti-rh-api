import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import { AccessPointFilterSearchInterface } from '../interfaces/access_point_filter_search_interface.js'
import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import { LogAccessPoint } from '../interfaces/MongoDB/log_access_point.js'
import { LogStore } from '#models/MongoDB/log_store'

export default class AccessPointService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
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
    const accessPoints = await AccessPoint.query()
      .whereNull('access_point_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(access_point_name) LIKE ?', [`%${filters.search!.toUpperCase()}%`])
      })
      .select(selectedColumns)
      .preload('businessUnit')
      .orderBy('access_point_created_at', 'asc')
      .paginate(filters.page, filters.limit)

    return accessPoints
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

  async delete(currentAccessPoint: AccessPoint) {
    await currentAccessPoint.delete()
    return currentAccessPoint
  }

  async show(accessPointId: number) {
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
    const accessPoint = await AccessPoint.query()
      .whereNull('access_point_deleted_at')
      .where('access_point_id', accessPointId)
      .select(selectedColumns)
      .preload('businessUnit')
      .first()
    return accessPoint ? accessPoint : null
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
}
