import { test } from '@japa/runner'
import { parseZoneSort, ZONE_SORT } from '#constants/zone_sort'

test.group('parseZoneSort', () => {
  test('acepta los dos órdenes por nombre', ({ assert }) => {
    assert.equal(parseZoneSort('name_asc'), ZONE_SORT.NAME_ASC)
    assert.equal(parseZoneSort('name_desc'), ZONE_SORT.NAME_DESC)
  })

  test('ausente o desconocido conserva el orden por fecha de alta', ({ assert }) => {
    assert.isNull(parseZoneSort(undefined))
    assert.isNull(parseZoneSort('zone_created_at; drop table zones'))
    assert.isNull(parseZoneSort(1))
  })
})
