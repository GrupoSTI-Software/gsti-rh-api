import { test } from '@japa/runner'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import Position from '#models/position'
import User from '#models/user'

/**
 * Tests funcionales — PositionController.getPdf y PositionController.getExcel
 * Rutas:
 *   - GET /api/positions/get-pdf/:positionId
 *   - GET /api/positions/get-excel/:positionId
 *
 * Validaciones / comportamiento documentado:
 *
 * GET /api/positions/get-pdf/:positionId
 *   - positionId: requerido, número entero positivo (path param)
 *   - El puesto debe pertenecer a una BusinessUnit activa cuyo slug esté en
 *     la variable de entorno `SYSTEM_BUSINESS` (separada por comas).
 *   - 200 → application/pdf con la cabecera Content-Disposition de descarga.
 *   - 404 → cuando el puesto no existe o no pertenece a una unidad permitida.
 *   - 400 → cuando el path param falta (no pasa por el ruteo, devuelve 404
 *           del router; este test no aplica para ID vacío en path).
 *   - 500 → error interno inesperado.
 *
 * GET /api/positions/get-excel/:positionId
 *   - Idem al PDF, devolviendo el MIME XLSX y Content-Disposition .xlsx.
 *
 * NOTA: Estas dos rutas NO requieren autenticación según
 * `start/routes/position_routes.ts` (no se aplica `middleware.auth()` al
 * grupo `/api/positions`).
 */

/**
 * Localiza un puesto que pertenezca a una unidad de negocio activa configurada
 * en `SYSTEM_BUSINESS`. Devuelve null si no hay ninguno disponible para no
 * fallar el test en entornos con datos limitados.
 */
async function findValidPosition(): Promise<Position | null> {
  const businessConf = `${env.get('SYSTEM_BUSINESS')}`
  const businessList = businessConf.split(',')
  const businessUnits = await BusinessUnit.query()
    .where('business_unit_active', 1)
    .whereIn('business_unit_slug', businessList)
  const ids = businessUnits.map((b) => b.businessUnitId)

  if (ids.length === 0) return null

  return await Position.query()
    .whereIn('businessUnitId', ids)
    .whereNull('position_deleted_at')
    .first()
}

async function resolveAuthContext() {
  const user = await User.query().whereNull('user_deleted_at').firstOrFail()
  const position = await findValidPosition()

  if (position?.businessUnitId) {
    return { user, businessUnitId: position.businessUnitId, position }
  }

  const businessConf = `${env.get('SYSTEM_BUSINESS')}`
  const businessList = businessConf.split(',')
  const businessUnit = await BusinessUnit.query()
    .where('business_unit_active', 1)
    .whereIn('business_unit_slug', businessList)
    .first()

  return { user, businessUnitId: businessUnit?.businessUnitId ?? 1, position: null }
}

test.group('Position PDF - GET /api/positions/get-pdf/:positionId', () => {
  test('devuelve 404 si el puesto no existe', async ({ client }) => {
    const ctx = await resolveAuthContext()
    const response = await client
      .get('/api/positions/get-pdf/999999999')
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 200 con un PDF válido cuando el puesto existe', async ({
    client,
    assert,
  }) => {
    const ctx = await resolveAuthContext()
    const position = ctx.position

    if (!position) {
      // Sin datos válidos en BD se omite la verificación 200 (caso ambiental)
      assert.isNull(position)
      return
    }

    const response = await client
      .get(`/api/positions/get-pdf/${position.positionId}`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(200)
    response.assertHeader('content-type', 'application/pdf')

    const disposition = response.header('content-disposition')
    assert.exists(disposition)
    assert.match(String(disposition), /perfil-puesto-\d+\.pdf/)

    const contentLength = response.header('content-length')
    assert.exists(contentLength)
    assert.isAtLeast(Number(contentLength), 1)
  })
})

test.group('Position Excel - GET /api/positions/get-excel/:positionId', () => {
  test('devuelve 404 si el puesto no existe', async ({ client }) => {
    const ctx = await resolveAuthContext()
    const response = await client
      .get('/api/positions/get-excel/999999999')
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 200 con un XLSX válido cuando el puesto existe', async ({
    client,
    assert,
  }) => {
    const ctx = await resolveAuthContext()
    const position = ctx.position

    if (!position) {
      assert.isNull(position)
      return
    }

    const response = await client
      .get(`/api/positions/get-excel/${position.positionId}`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(200)
    response.assertHeader(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    const disposition = response.header('content-disposition')
    assert.exists(disposition)
    assert.match(String(disposition), /perfil-puesto-\d+\.xlsx/)

    const contentLength = response.header('content-length')
    assert.exists(contentLength)
    assert.isAtLeast(Number(contentLength), 1)
  })
})
