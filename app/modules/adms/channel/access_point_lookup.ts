import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { ADMS_RATE } from '#modules/adms/adms.constants'

export interface AccessPointLookupRow {
  accessPointId: number
  businessUnitId: number
  serial: string
  active: boolean
  allowedCidrs: string[] | null
  timezone: string | null
  lastConnectionAt: DateTime | null
}

/**
 * Busqueda de la serie fuera del scope de tenant (spec v2, 4.2 paso 2 y 13
 * regla 2). Se hace con el query builder, sin modelo, para no depender del
 * mixin ni de `runUnscoped` (que emite un warn por llamada).
 */
export interface AccessPointLookupPort {
  findBySerial(serial: string): Promise<AccessPointLookupRow | null>
  touchConnection(accessPointId: number, ip: string, now: DateTime): Promise<void>
}

interface AccessPointRawRow {
  access_point_id: number
  business_unit_id: number
  access_point_serial_number: string
  access_point_active: number
  access_point_allowed_cidrs: string | string[] | null
  access_point_timezone: string | null
  access_point_last_connection: Date | string | null
}

/**
 * `null` significa "sin restriccion configurada"; una lista vacia significa
 * "configurada y no autoriza a nadie". Por eso un JSON corrupto devuelve `[]`
 * y no `null`: una restriccion ilegible no puede convertirse en barra libre
 * (spec 13, regla 10, fail-closed).
 */
function parseCidrs(value: string | string[] | null): string[] | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export class AccessPointLookupMysql implements AccessPointLookupPort {
  async findBySerial(serial: string): Promise<AccessPointLookupRow | null> {
    const row = await db
      .from('access_points')
      .whereNull('access_point_deleted_at')
      .where('access_point_serial_number', serial)
      .select(
        'access_point_id',
        'business_unit_id',
        'access_point_serial_number',
        'access_point_active',
        'access_point_allowed_cidrs',
        'access_point_timezone',
        'access_point_last_connection'
      )
      .first()
    if (!row) return null
    const typed = row as AccessPointRawRow
    return {
      accessPointId: typed.access_point_id,
      businessUnitId: typed.business_unit_id,
      serial: typed.access_point_serial_number,
      active: Number(typed.access_point_active) === 1,
      allowedCidrs: parseCidrs(typed.access_point_allowed_cidrs),
      timezone: typed.access_point_timezone,
      lastConnectionAt:
        typed.access_point_last_connection === null
          ? null
          : DateTime.fromJSDate(new Date(typed.access_point_last_connection)),
    }
  }

  async touchConnection(accessPointId: number, ip: string, now: DateTime): Promise<void> {
    await db.from('access_points').where('access_point_id', accessPointId).update({
      access_point_last_connection: now.toFormat('yyyy-MM-dd HH:mm:ss'),
      access_point_status: 1,
      access_point_ip: ip,
    })
  }
}

/** Encarece la enumeracion de series: cuenta series NUEVAS por IP y bloquea por minutos. */
export interface UnknownSerialThrottle {
  isBlocked(ip: string): Promise<boolean>
  countNewSerial(ip: string): Promise<'ok' | 'threshold_reached'>
}

export class UnknownSerialThrottleMemory implements UnknownSerialThrottle {
  private counter() {
    return limiter.use({ requests: ADMS_RATE.unknownSerialPerHour, duration: '1 hour' })
  }

  private key(ip: string): string {
    return `adms-unknown-serial:${ip}`
  }

  async isBlocked(ip: string): Promise<boolean> {
    return this.counter().isBlocked(this.key(ip))
  }

  async countNewSerial(ip: string): Promise<'ok' | 'threshold_reached'> {
    const counter = this.counter()
    const key = this.key(ip)
    const state = await counter.increment(key)
    if (state.remaining > 0) return 'ok'
    await counter.block(key, `${ADMS_RATE.unknownSerialBlockMinutes} minutes`)
    return 'threshold_reached'
  }
}
