import type { DateTime } from 'luxon'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import type {
  QuarantineClaimOnContact,
  QuarantineCreate,
  QuarantineRepository,
  QuarantineRow,
  QuarantineTouch,
} from './quarantine.repository.js'

function toRow(model: AdmsQuarantinedDevice): QuarantineRow {
  return {
    id: model.admsQuarantinedDeviceId,
    serial: model.admsQuarantinedDeviceSerial,
    status: model.admsQuarantinedDeviceStatus,
    hitCount: model.admsQuarantinedDeviceHitCount,
    lastIp: model.admsQuarantinedDeviceLastIp,
    firstSeenAt: model.admsQuarantinedDeviceFirstSeenAt,
    lastSeenAt: model.admsQuarantinedDeviceLastSeenAt,
    hints: model.admsQuarantinedDeviceHints,
  }
}

/** Adaptador Lucid de la cuarentena. Tabla global: sin scope de tenant. */
export default class QuarantineRepositoryMysql implements QuarantineRepository {
  async findBySerial(serial: string): Promise<QuarantineRow | null> {
    const row = await AdmsQuarantinedDevice.query()
      .where('adms_quarantined_device_serial', serial)
      .first()
    return row ? toRow(row) : null
  }

  async create(input: QuarantineCreate): Promise<QuarantineRow> {
    const model = new AdmsQuarantinedDevice()
    model.admsQuarantinedDeviceSerial = input.serial
    model.admsQuarantinedDeviceFirstSeenAt = input.now
    model.admsQuarantinedDeviceLastSeenAt = input.now
    model.admsQuarantinedDeviceLastIp = input.ip
    model.admsQuarantinedDeviceHitCount = 1
    model.admsQuarantinedDeviceHints = input.hints
    model.admsQuarantinedDeviceStatus = 'pending'
    model.admsQuarantinedDeviceFailedClaims = 0
    await model.save()
    return toRow(model)
  }

  async touch(id: number, input: QuarantineTouch): Promise<void> {
    const model = await AdmsQuarantinedDevice.find(id)
    if (!model) return
    model.admsQuarantinedDeviceHitCount += 1
    model.admsQuarantinedDeviceLastIp = input.ip
    model.admsQuarantinedDeviceLastSeenAt = input.now
    if (input.hints) model.admsQuarantinedDeviceHints = input.hints
    await model.save()
  }

  async countCreatedByIpSince(ip: string, since: DateTime): Promise<number> {
    const row = await AdmsQuarantinedDevice.query()
      .where('adms_quarantined_device_last_ip', ip)
      .where('adms_quarantined_device_first_seen_at', '>=', since.toFormat('yyyy-MM-dd HH:mm:ss'))
      .count('* as total')
      .first()
    return Number(row?.$extras.total ?? 0)
  }

  async markClaimed(id: number, input: QuarantineClaimOnContact): Promise<void> {
    await AdmsQuarantinedDevice.query().where('adms_quarantined_device_id', id).update({
      adms_quarantined_device_status: 'claimed',
      claimed_access_point_id: input.accessPointId,
      claimed_business_unit_id: input.businessUnitId,
      adms_quarantined_device_resolved_at: input.now.toFormat('yyyy-MM-dd HH:mm:ss'),
    })
  }
}
