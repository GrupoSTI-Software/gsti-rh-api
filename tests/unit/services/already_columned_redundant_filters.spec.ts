import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058567 — el matiz central de esta HU: retirar SOLO el candado
 * cross-tenant manual que el mixin ya cubre bajo contexto activo, y
 * conservar todo `where` single-BU de negocio o load-bearing (crudo).
 */

const ROOT = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8')
}

/** Descarta líneas de comentario (`//` o `*`) para no confundir prosa explicativa con código activo. */
function codeOnly(content: string): string {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

test.group('telework-policy — candados manuales retirados', () => {
  test('telework_policy.repository.mysql.ts ya no filtra por business_unit_id en sus 6 queries de TeleworkPolicy', ({
    assert,
  }) => {
    const content = read('app/modules/telework-policy/telework_policy.repository.mysql.ts')

    // Ninguna de las queries de TeleworkPolicy debe filtrar manualmente por
    // business_unit_id: el mixin ya lo hace bajo contexto activo.
    assert.notMatch(content, /TeleworkPolicy\.query\([^)]*\)\s*\n\s*\.where\('business_unit_id'/)
    assert.notInclude(content, ".where('business_unit_id', businessUnitId)")

    // Los métodos deben seguir existiendo con su parámetro (aunque no lo usen
    // ya para filtrar): la firma pública del repositorio no cambia.
    assert.include(content, 'findActiveByBusinessUnit(')
    assert.include(content, 'findActiveByBusinessUnitForUpdate(')
    assert.include(content, 'findCurrentByBusinessUnit(')
    assert.include(content, 'findCurrentByBusinessUnitForUpdate(')
    assert.include(content, 'findMaxVersion(')
    assert.include(content, 'listVersions(')
  })

  test('telework_policy_acknowledgement.repository.mysql.ts retiró el filtro redundante (ya compone el mixin)', ({
    assert,
  }) => {
    const content = read(
      'app/modules/telework-policy/telework_policy_acknowledgement.repository.mysql.ts'
    )
    assert.notInclude(content, ".where('business_unit_id', businessUnitId)")
    assert.include(content, 'listByBusinessUnit(')
  })

  test('telework_policy_notification.service.ts retiró el filtro redundante sobre BusinessUnit (ya scoped)', ({
    assert,
  }) => {
    const content = read('app/modules/telework-policy/telework_policy_notification.service.ts')
    assert.notInclude(content, ".where('business_unit_id', businessUnitId)")
    assert.include(content, 'resolveBrandingForBusinessUnit(')
  })
})

test.group('retention_policy_service — candados manuales retirados', () => {
  test('getByBusinessUnit y upsert ya no filtran manualmente por business_unit_id', ({
    assert,
  }) => {
    const content = read('app/services/retention_policy_service.ts')
    assert.notInclude(content, ".where('business_unit_id', businessUnitId)")
    assert.include(content, 'async getByBusinessUnit(')
    assert.include(content, 'async upsert(')
  })
})

test.group('access_point — candados manuales retirados, filtro de negocio conservado', () => {
  test('access_point_service.ts show() retiró el whereIn redundante', ({ assert }) => {
    const content = codeOnly(read('app/services/access_point_service.ts'))
    assert.notMatch(content, /whereIn\('business_unit_id', allowedBusinessUnitIds\)/)
  })

  test('access_point_service.ts index() CONSERVA el where single-BU de negocio', ({ assert }) => {
    const content = read('app/services/access_point_service.ts')
    assert.include(content, ".where('business_unit_id', filters.businessUnitId)")
  })

  test('access_point_service.ts findBySerialNumber() no se tocó (fail-open, sin contexto)', ({
    assert,
  }) => {
    const content = read('app/services/access_point_service.ts')
    const start = content.indexOf('async findBySerialNumber(')
    assert.isAbove(start, -1)
    const body = content.slice(start, start + 400)
    assert.notMatch(body, /business_unit_id/)
  })

  test('access_point_controller.ts update() y delete() retiraron el whereIn redundante', ({
    assert,
  }) => {
    const content = codeOnly(read('app/controllers/access_point_controller.ts'))
    assert.notMatch(content, /whereIn\('business_unit_id', businessUnitScope\)/)
  })
})

test.group('attention_program_service — filtros crudos load-bearing intactos', () => {
  test('baseListQuery y findOriginInScopeOrFail conservan sus whereIn/whereRaw manuales', ({
    assert,
  }) => {
    const content = read('app/services/attention_program_service.ts')

    assert.include(content, "query.whereIn('ap.business_unit_id', allowedBusinessUnitIds)")
    assert.include(content, "query.whereRaw('1 = 0')")
    assert.include(content, "query.whereIn('business_unit_id', allowedBusinessUnitIds)")

    // Estas queries usan `db.from` crudo (no el modelo AttentionProgram) —
    // el mixin nunca las cubriría, así que deben permanecer intactas.
    assert.include(content, ".from('attention_programs as ap')")
    assert.match(content, /return db\s*\n\s*\.from\('attention_programs as ap'\)/)
  })
})
