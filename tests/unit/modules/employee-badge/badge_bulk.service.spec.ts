import { test } from '@japa/runner'
import {
  BULK_BADGES_PER_PAGE,
  BULK_CELL_HEIGHT,
  BULK_CELL_WIDTH,
  buildBadgeFileName,
  buildBulkDownloadFilename,
  computeBadgeCellPosition,
} from '#modules/employee-badge/badge_bulk.service'

test.group('BadgeBulkService - helpers', () => {
  test('buildBadgeFileName usa solo el slug opaco del empleado', ({ assert }) => {
    const slug = '3f2c1a9e-7b4d-4e21-9a0f-1c2d3e4f5a6b'
    assert.equal(buildBadgeFileName(slug, 'png'), `gafete-${slug}.png`)
    assert.equal(buildBadgeFileName(slug, 'pdf'), `gafete-${slug}.pdf`)
  })

  test('buildBulkDownloadFilename incluye extensión según formato', ({ assert }) => {
    assert.match(buildBulkDownloadFilename('pdf'), /^gafetes-\d{4}-\d{2}-\d{2}\.pdf$/)
    assert.match(buildBulkDownloadFilename('png'), /^gafetes-\d{4}-\d{2}-\d{2}\.zip$/)
  })

  test('computeBadgeCellPosition distribuye 2 columnas × 4 filas por página', ({ assert }) => {
    const first = computeBadgeCellPosition(0)
    const secondCol = computeBadgeCellPosition(1)
    const secondRow = computeBadgeCellPosition(2)
    const ninth = computeBadgeCellPosition(8)

    assert.equal(first.pageIndex, 0)
    assert.approximately(first.x, 57.35, 0.01)
    assert.approximately(first.y, 71.86, 0.01)
    assert.isAbove(secondCol.x, first.x)
    assert.equal(secondCol.y, first.y)
    assert.equal(secondRow.x, first.x)
    assert.isAbove(secondRow.y, first.y)
    assert.equal(ninth.pageIndex, 1)
    assert.equal(ninth.y, first.y)
  })

  test('computeBadgeCellPosition respeta dimensiones CR80', ({ assert }) => {
    const cell = computeBadgeCellPosition(3)
    const nextRow = computeBadgeCellPosition(4)

    assert.approximately(nextRow.y - cell.y, BULK_CELL_HEIGHT + 12, 0.01)
    assert.equal(BULK_CELL_WIDTH, 242.65)
    assert.equal(BULK_CELL_HEIGHT, 153.07)
    assert.equal(BULK_BADGES_PER_PAGE, 8)
  })
})
