import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import WorkJournalEntry from '#models/work_journal_entry'
import { WorkJournalEntryError } from '#exceptions/work_journal_entry_error'

/**
 * Tests unitarios del guardia write-once de `WorkJournalEntry`
 * (`rejectSealedMutation`, regla de negocio #6).
 *
 * Es un hook `beforeUpdate` que solo compara `entry.$original` contra los
 * valores actuales de la instancia, por lo que se puede invocar directamente
 * con un mock en memoria sin necesidad de conexión a MySQL.
 */

const CLOSED_SNAPSHOT = {
  employeeId: 10,
  businessUnitId: 1,
  date: '2026-06-01',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-15',
  checkIn: '2026-06-01T08:00:00.000-06:00',
  checkOut: '2026-06-01T17:00:00.000-06:00',
  workedMinutes: 540,
  dayStatus: 'ontime',
  shiftId: 3,
  workingTimeRuleId: 1,
}

/**
 * Construye una entrada cuyo estado *actual* (post-asignación, antes de
 * persistir) difiere de `$original` (lo que había en base) según `overrides`.
 * Así se simula un intento de mutar una fila que ya estaba `closed`.
 */
function makeClosedEntry(
  overrides: Partial<WorkJournalEntry> = {},
  originalOverrides: Partial<WorkJournalEntry> = {}
): WorkJournalEntry {
  const original = {
    workJournalEntryId: 1,
    employeeId: 10,
    businessUnitId: 1,
    workingTimeRuleId: 1,
    shiftId: 3,
    date: DateTime.fromISO('2026-06-01'),
    periodStart: DateTime.fromISO('2026-06-01'),
    periodEnd: DateTime.fromISO('2026-06-15'),
    checkIn: DateTime.fromISO('2026-06-01T08:00:00.000-06:00'),
    checkOut: DateTime.fromISO('2026-06-01T17:00:00.000-06:00'),
    workedMinutes: 540,
    dayStatus: 'ontime',
    status: 'closed' as const,
    closedAt: DateTime.fromISO('2026-06-16T00:00:00.000-06:00'),
    snapshot: CLOSED_SNAPSHOT,
    contentHash: 'seal-hash',
    hmacKeyVersion: 1,
    deletedAt: null,
  }

  const entry = { ...original, ...overrides } as WorkJournalEntry
  ;(entry as unknown as { $original: unknown }).$original = { ...original, ...originalOverrides }
  return entry
}

test.group('WorkJournalEntry — rejectSealedMutation (write-once)', () => {
  test('permite el update si la fila original no estaba cerrada', ({ assert }) => {
    const entry = makeClosedEntry(
      { status: 'closed', workedMinutes: 999 },
      { status: 'open' }
    )

    assert.doesNotThrow(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('permite un update que no cambia ningún valor congelado (no-op)', ({ assert }) => {
    const entry = makeClosedEntry()

    assert.doesNotThrow(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('permite mutar deletedAt (soft delete administrativo) en una fila cerrada', ({
    assert,
  }) => {
    const entry = makeClosedEntry({ deletedAt: DateTime.fromISO('2026-07-01') })

    assert.doesNotThrow(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('rechaza mutar workedMinutes en una fila cerrada', ({ assert }) => {
    const entry = makeClosedEntry({ workedMinutes: 999 })

    assert.throws(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('rechaza mutar checkIn en una fila cerrada', ({ assert }) => {
    const entry = makeClosedEntry({ checkIn: DateTime.fromISO('2026-06-01T09:00:00.000-06:00') })

    assert.throws(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('rechaza mutar dayStatus en una fila cerrada', ({ assert }) => {
    const entry = makeClosedEntry({ dayStatus: 'absence' })

    assert.throws(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('rechaza mutar snapshot o contentHash (el sello) en una fila cerrada', ({ assert }) => {
    const entry = makeClosedEntry({ contentHash: 'otro-hash' })

    assert.throws(() => WorkJournalEntry.rejectSealedMutation(entry))
  })

  test('el error lanzado usa la key y el código de negocio esperados', ({ assert }) => {
    const entry = makeClosedEntry({ workedMinutes: 1 })

    try {
      WorkJournalEntry.rejectSealedMutation(entry)
      assert.fail('se esperaba que rejectSealedMutation lanzara un error')
    } catch (error) {
      assert.instanceOf(error, WorkJournalEntryError)
      assert.equal((error as WorkJournalEntryError).key, 'registro-inmutable')
      assert.equal((error as WorkJournalEntryError).httpStatus, 409)
    }
  })
})
