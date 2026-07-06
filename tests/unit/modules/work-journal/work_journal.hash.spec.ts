import { test } from '@japa/runner'
import {
  canonicalizeSnapshot,
  computeSeal,
  CURRENT_HMAC_KEY_VERSION,
  sealsMatch,
} from '#modules/work-journal/work_journal.hash'
import type { WorkJournalSnapshot } from '#models/work_journal_entry'

/**
 * Tests unitarios del sellado HMAC-SHA-256 de `work_journal.hash.ts`.
 *
 * Es lógica pura (no toca base de datos): cubre que el sello sea determinista,
 * que cualquier alteración del snapshot lo invalide (detección de manipulación,
 * regla de negocio #6) y que la comparación de sellos sea correcta.
 */

function makeSnapshot(overrides: Partial<WorkJournalSnapshot> = {}): WorkJournalSnapshot {
  return {
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
    ...overrides,
  }
}

test.group('work_journal.hash — canonicalización', () => {
  test('produce el mismo JSON sin importar el orden de las llaves del snapshot', ({ assert }) => {
    const snapshot = makeSnapshot()
    const reordered = Object.fromEntries(
      Object.entries(snapshot).reverse()
    ) as WorkJournalSnapshot

    assert.equal(canonicalizeSnapshot(snapshot), canonicalizeSnapshot(reordered))
  })

  test('cambia si cambia cualquier valor del snapshot', ({ assert }) => {
    const base = canonicalizeSnapshot(makeSnapshot())
    const changed = canonicalizeSnapshot(makeSnapshot({ workedMinutes: 541 }))

    assert.notEqual(base, changed)
  })
})

test.group('work_journal.hash — computeSeal / sealsMatch', () => {
  test('el sello es determinista: mismo snapshot produce el mismo sello', ({ assert }) => {
    const snapshot = makeSnapshot()

    const sealA = computeSeal(snapshot)
    const sealB = computeSeal(snapshot)

    assert.equal(sealA, sealB)
  })

  test('detecta manipulación: cambiar un solo campo invalida el sello original', ({ assert }) => {
    const original = makeSnapshot()
    const tampered = makeSnapshot({ workedMinutes: 999 })

    const originalSeal = computeSeal(original)
    const sealOfTampered = computeSeal(tampered)

    assert.isFalse(sealsMatch(originalSeal, sealOfTampered))
  })

  test('sealsMatch es verdadero solo cuando ambos sellos son iguales', ({ assert }) => {
    const snapshot = makeSnapshot()
    const seal = computeSeal(snapshot)

    assert.isTrue(sealsMatch(seal, seal))
    assert.isTrue(sealsMatch(seal, computeSeal(snapshot)))
  })

  test('sealsMatch devuelve false ante sellos de distinta longitud', ({ assert }) => {
    assert.isFalse(sealsMatch('ab', 'abcd'))
  })

  test('sealsMatch devuelve false si ambos sellos están vacíos', ({ assert }) => {
    assert.isFalse(sealsMatch('', ''))
  })

  test('usa la versión de llave vigente por defecto', ({ assert }) => {
    assert.equal(CURRENT_HMAC_KEY_VERSION, 1)
  })

  test('rechaza sellar con una versión de llave distinta a la vigente', ({ assert }) => {
    assert.throws(() => computeSeal(makeSnapshot(), 2))
  })
})
