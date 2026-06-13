import { test } from '@japa/runner'
import TraumaticEventType from '#models/traumatic_event_type'

/**
 * Tests unitarios del modelo TraumaticEventType.
 * No requieren base de datos: validan metadatos de columnas y SoftDeletes.
 */

function assertColumn(
  assert: { exists: (...args: any[]) => void; equal: (...args: any[]) => void },
  attribute: string,
  columnName: string,
  isPrimary?: boolean
) {
  const col = TraumaticEventType.$getColumn(attribute)
  assert.exists(col, `Columna "${attribute}" no definida en TraumaticEventType`)
  if (!col) return
  assert.equal(col.columnName, columnName, `columnName de "${attribute}"`)
  if (isPrimary !== undefined) {
    assert.equal(col.isPrimary, isPrimary)
  }
}

test.group('TraumaticEventType — metadatos del modelo', () => {
  test('usa la tabla traumatic_event_types y PK traumatic_event_type_id', ({ assert }) => {
    assert.equal(TraumaticEventType.table, 'traumatic_event_types')
    assert.equal(TraumaticEventType.primaryKey, 'traumaticEventTypeId')
    assertColumn(assert, 'traumaticEventTypeId', 'traumatic_event_type_id', true)
  })

  test('mapea nombre, descripción, slug y active a snake_case', ({ assert }) => {
    assertColumn(assert, 'traumaticEventTypeName', 'traumatic_event_type_name')
    assertColumn(assert, 'traumaticEventTypeDescription', 'traumatic_event_type_description')
    assertColumn(assert, 'traumaticEventTypeSlug', 'traumatic_event_type_slug')
    assertColumn(assert, 'traumaticEventTypeActive', 'traumatic_event_type_active')
  })

  test('mapea timestamps prefijados y deletedAt explícito', ({ assert }) => {
    assertColumn(assert, 'traumaticEventTypeCreatedAt', 'traumatic_event_type_created_at')
    assertColumn(assert, 'traumaticEventTypeUpdatedAt', 'traumatic_event_type_updated_at')
    assertColumn(assert, 'deletedAt', 'traumatic_event_type_deleted_at')
  })

  test('expone todas las columnas esperadas', ({ assert }) => {
    const expected = [
      'traumaticEventTypeId',
      'traumaticEventTypeName',
      'traumaticEventTypeDescription',
      'traumaticEventTypeSlug',
      'traumaticEventTypeActive',
      'traumaticEventTypeCreatedAt',
      'traumaticEventTypeUpdatedAt',
      'deletedAt',
    ]
    for (const attr of expected) {
      assert.exists(
        TraumaticEventType.$getColumn(attr),
        `Falta columna "${attr}" en TraumaticEventType`
      )
    }
  })
})
