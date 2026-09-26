import type { DateTime } from 'luxon'
import type { AdmsQuarantineHints } from '#models/adms_quarantined_device'
import { ADMS_RATE } from '#modules/adms/adms.constants'
import QuarantineRepositoryMysql from './quarantine.repository.mysql.js'
import type { QuarantineRepository } from './quarantine.repository.js'

export type QuarantineHitOutcome = 'created' | 'updated' | 'ip_daily_cap'

const HINT_KEYS: ReadonlyArray<keyof AdmsQuarantineHints> = [
  'platform',
  'fwVersion',
  'pushVersion',
  'deviceName',
]
const HINT_MAX_LENGTH = 100

/** Deja solo las pistas permitidas y las acota (spec 13, regla 11). */
export function sanitizeQuarantineHints(
  hints: AdmsQuarantineHints | null | undefined
): AdmsQuarantineHints | null {
  if (!hints) return null
  const clean: AdmsQuarantineHints = {}
  for (const key of HINT_KEYS) {
    const value = hints[key]
    if (typeof value === 'string' && value.length > 0) clean[key] = value.slice(0, HINT_MAX_LENGTH)
  }
  return Object.keys(clean).length > 0 ? clean : null
}

/**
 * Cuarentena de series desconocidas (spec v2, 4.2). El canal solo registra el
 * contacto; el reclamo humano vive en la rebanada 11. `claimOnContact` cierra
 * la cuarentena cuando la serie ya resolvio a un punto de acceso (alta desde
 * el landlord o el Backoffice).
 */
export default class QuarantineService {
  private readonly repository: QuarantineRepository

  constructor(repository?: QuarantineRepository) {
    this.repository = repository ?? new QuarantineRepositoryMysql()
  }

  async recordHit(input: {
    serial: string
    ip: string
    hints: AdmsQuarantineHints | null
    now: DateTime
  }): Promise<QuarantineHitOutcome> {
    const hints = sanitizeQuarantineHints(input.hints)
    const existing = await this.repository.findBySerial(input.serial)
    if (existing) {
      await this.repository.touch(existing.id, { ip: input.ip, hints, now: input.now })
      return 'updated'
    }

    const createdToday = await this.repository.countCreatedByIpSince(
      input.ip,
      input.now.minus({ hours: 24 })
    )
    if (createdToday >= ADMS_RATE.quarantineRowsPerIpPerDay) return 'ip_daily_cap'

    await this.repository.create({ serial: input.serial, ip: input.ip, hints, now: input.now })
    return 'created'
  }

  async claimOnContact(
    serial: string,
    accessPointId: number,
    businessUnitId: number,
    now: DateTime
  ): Promise<boolean> {
    const existing = await this.repository.findBySerial(serial)
    if (!existing || existing.status !== 'pending') return false
    await this.repository.markClaimed(existing.id, { accessPointId, businessUnitId, now })
    return true
  }
}
