import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import UploadProgressService from '#modules/access-point/upload-progress/upload_progress.service'
import type {
  StampReset,
  UploadProgressRepository,
  UploadProgressRow,
} from '#modules/access-point/upload-progress/upload_progress.repository'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function makeRepository(rows: UploadProgressRow[]) {
  const resets: StampReset[] = []
  const repository: UploadProgressRepository = {
    async stampsFor() {
      return Object.fromEntries(rows.map((row) => [row.table, row.value]))
    },
    async advance() {},
    async listFor() {
      return rows
    },
    async resetAll(input) {
      resets.push(input)
      for (const row of rows) {
        row.value = '0'
        row.resetAt = input.now
        row.resetByUserId = input.userId
      }
    },
  }
  return { repository, resets }
}

test.group('ADMS upload progress service', () => {
  test('lista las cinco tablas del saludo y rellena con cero las que no tienen fila', async ({
    assert,
  }) => {
    const { repository } = makeRepository([
      {
        table: 'ATTLOG',
        value: '9999',
        lastUploadAt: NOW,
        lastUploadLines: 3,
        resetAt: null,
        resetByUserId: null,
      },
    ])
    const service = new UploadProgressService(repository)
    const list = await service.list(12)
    assert.deepEqual(
      list.map((row) => row.table),
      ['ATTLOG', 'OPERLOG', 'USERINFO', 'ATTPHOTO', 'BIODATA']
    )
    assert.equal(list[0].value, '9999')
    assert.equal(list[0].lastUploadAt, NOW.toISO())
    assert.equal(list[0].lastUploadLines, 3)
    assert.equal(list[1].value, '0')
    assert.isNull(list[1].lastUploadAt)
  })

  test('reset pone todo en cero, registra quien y devuelve la lista', async ({ assert }) => {
    const { repository, resets } = makeRepository([
      {
        table: 'ATTLOG',
        value: '9999',
        lastUploadAt: NOW,
        lastUploadLines: 3,
        resetAt: null,
        resetByUserId: null,
      },
    ])
    const service = new UploadProgressService(repository)
    const list = await service.reset(12, 1, 44, NOW)
    assert.deepEqual(resets, [{ accessPointId: 12, businessUnitId: 1, userId: 44, now: NOW }])
    assert.equal(list[0].value, '0')
    assert.equal(list[0].resetByUserId, 44)
    assert.equal(list[0].resetAt, NOW.toISO())
  })
})
