import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import QuarantineService from '#modules/access-point/quarantine/quarantine.service'
import type {
  QuarantineRepository,
  QuarantineRow,
} from '#modules/access-point/quarantine/quarantine.repository'

function makeRepository(rows: QuarantineRow[] = [], createdTodayByIp = 0) {
  const repository: QuarantineRepository = {
    async findBySerial(serial) {
      return rows.find((row) => row.serial === serial) ?? null
    },
    async create(input) {
      const row: QuarantineRow = {
        id: rows.length + 1,
        serial: input.serial,
        status: 'pending',
        hitCount: 1,
        lastIp: input.ip,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
        hints: input.hints,
      }
      rows.push(row)
      return row
    },
    async touch(id, input) {
      const row = rows.find((candidate) => candidate.id === id)
      if (!row) return
      row.hitCount += 1
      row.lastIp = input.ip
      row.lastSeenAt = input.now
      if (input.hints) row.hints = input.hints
    },
    async countCreatedByIpSince() {
      return createdTodayByIp
    },
    async markClaimed(id, input) {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) row.status = 'claimed'
      void input
    },
  }
  return { repository, rows }
}

test.group('ADMS quarantine service', () => {
  test('primer contacto crea la fila con las pistas filtradas y acotadas', async ({ assert }) => {
    const { repository, rows } = makeRepository()
    const service = new QuarantineService(repository)
    const outcome = await service.recordHit({
      serial: 'NYU7253300829',
      ip: '192.168.1.99',
      hints: { platform: 'ZAM70_TFT', fwVersion: 'x'.repeat(200), deviceName: 'SenseFace' },
      now: DateTime.utc(),
    })
    assert.equal(outcome, 'created')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].hints?.platform, 'ZAM70_TFT')
    assert.lengthOf(rows[0].hints?.fwVersion ?? '', 100)
  })

  test('contactos repetidos acumulan sin duplicar', async ({ assert }) => {
    const { repository, rows } = makeRepository()
    const service = new QuarantineService(repository)
    const now = DateTime.utc()
    await service.recordHit({ serial: 'NYU7253300829', ip: '1.1.1.1', hints: null, now })
    const outcome = await service.recordHit({
      serial: 'NYU7253300829',
      ip: '2.2.2.2',
      hints: null,
      now,
    })
    assert.equal(outcome, 'updated')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].hitCount, 2)
    assert.equal(rows[0].lastIp, '2.2.2.2')
  })

  test('una IP que ya creo el tope diario no crea filas nuevas', async ({ assert }) => {
    const { repository, rows } = makeRepository([], 200)
    const service = new QuarantineService(repository)
    const outcome = await service.recordHit({
      serial: 'ABCDEF123456',
      ip: '9.9.9.9',
      hints: null,
      now: DateTime.utc(),
    })
    assert.equal(outcome, 'ip_daily_cap')
    assert.lengthOf(rows, 0)
  })
})
