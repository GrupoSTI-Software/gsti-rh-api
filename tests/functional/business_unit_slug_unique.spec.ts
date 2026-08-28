import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { I18n } from '@adonisjs/i18n'
import BusinessUnit from '#models/business_unit'
import BusinessUnitService from '#services/business_unit_service'
import {
  BUSINESS_UNIT_SLUG_MAX_ATTEMPTS,
  BUSINESS_UNIT_SLUG_UNIQUE_INDEX,
} from '../../app/constants/business_unit.js'

/**
 * Tests funcionales — unicidad y reintento del slug opaco de empresa
 * (USRH1787932877000).
 *
 * Requieren base de datos con la migración
 * `1787932877000000_add_slug_active_unique_to_business_units` aplicada.
 * Cada test limpia sus propios datos en `teardown`; no hay fixtures globales.
 *
 * CA-1: dos empresas activas no pueden compartir slug → índice rechaza.
 * CA-2: empresa borrada libera su slug para una empresa activa nueva.
 * CA-3: `BusinessUnitService.create()` persiste el slug generado tal cual.
 * CA-4: el bucle de reintento espejo completa el alta antes de agotar intentos.
 * CA-5: el bucle de reintento espejo lanza error tipado al agotar intentos.
 */

function makeService(): BusinessUnitService {
  return new BusinessUnitService({ formatMessage: (k: string) => k } as unknown as I18n)
}

function buildBuData(slug: string, suffix: string): BusinessUnit {
  const bu = new BusinessUnit()
  bu.businessUnitName = `Test BU ${suffix}`
  bu.businessUnitSlug = slug
  bu.businessUnitLegalName = `Test Legal ${suffix}`
  bu.businessUnitActive = 1
  bu.businessUnitOrigin = 'platform'
  return bu
}

/**
 * Clase de error interna al espejo del bucle de reintento; replica el
 * comportamiento de `SignupDraftService.complete()` sin sus dependencias.
 */
class SlugExhaustedError extends Error {
  readonly code = 'TNT.BU.SLUG_CONFLICT'
  constructor(attempts: number) {
    super(`Slug colisionó ${attempts} veces: intentos agotados.`)
    this.name = 'SlugExhaustedError'
  }
}

/**
 * Espejo del bucle de reintento de `SignupDraftService.complete()`.
 * Recibe una secuencia de slugs predeterminados en lugar de generar slugs
 * aleatorios, lo que permite probar colisiones de forma determinista.
 */
async function retryingCreate(
  service: BusinessUnitService,
  slugSequence: string[]
): Promise<BusinessUnit> {
  for (const [attempt, slug] of slugSequence.entries()) {
    const data = buildBuData(slug, `retry-${attempt}-${Date.now()}`)
    try {
      return await service.create(data)
    } catch (error) {
      if (service.isSlugDuplicateError(error)) {
        if (attempt + 1 >= BUSINESS_UNIT_SLUG_MAX_ATTEMPTS) {
          throw new SlugExhaustedError(attempt + 1)
        }
        continue
      }
      throw error
    }
  }
  // Rama inalcanzable: slugSequence nunca está vacía en los tests.
  throw new SlugExhaustedError(slugSequence.length)
}

// ---------------------------------------------------------------------------
// CA-1 — índice rechaza dos empresas activas con el mismo slug
// ---------------------------------------------------------------------------

test.group('business_unit_slug_unique — CA-1: colisión entre empresas activas', (group) => {
  const createdIds: number[] = []

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', createdIds).delete()
    }
  })

  test('insertar slug duplicado en empresa activa lanza ER_DUP_ENTRY sobre el índice correcto', async ({
    assert,
  }) => {
    const service = makeService()
    const slug = `bu-ca1test${Date.now()}`

    const first = await service.create(buildBuData(slug, 'ca1-first'))
    createdIds.push(first.businessUnitId)

    let caughtError: unknown
    try {
      const second = await service.create(buildBuData(slug, 'ca1-second'))
      createdIds.push(second.businessUnitId) // limpieza si el insert no falla
    } catch (error) {
      caughtError = error
    }

    assert.isNotNull(caughtError, 'se esperaba ER_DUP_ENTRY pero no se lanzó ningún error')
    assert.isTrue(
      service.isSlugDuplicateError(caughtError),
      `el error no fue clasificado como duplicado de slug: ${JSON.stringify(caughtError)}`
    )
  })

  test('el error es del índice del slug, no de otro índice', async ({ assert }) => {
    const service = makeService()
    const slug = `bu-ca1idx${Date.now()}`

    const first = await service.create(buildBuData(slug, 'ca1-idx-first'))
    createdIds.push(first.businessUnitId)

    let caughtError: unknown
    try {
      const second = await service.create(buildBuData(slug, 'ca1-idx-second'))
      createdIds.push(second.businessUnitId)
    } catch (error) {
      caughtError = error
    }

    const err = caughtError as { sqlMessage?: string; original?: { sqlMessage?: string } }
    const sqlMsg = err?.sqlMessage ?? err?.original?.sqlMessage ?? ''
    assert.include(
      sqlMsg,
      BUSINESS_UNIT_SLUG_UNIQUE_INDEX,
      `sqlMessage no menciona el índice esperado "${BUSINESS_UNIT_SLUG_UNIQUE_INDEX}": "${sqlMsg}"`
    )
  })
})

// ---------------------------------------------------------------------------
// CA-2 — empresa borrada libera el slug para una empresa activa nueva
// ---------------------------------------------------------------------------

test.group('business_unit_slug_unique — CA-2: slug libre tras soft-delete', (group) => {
  const createdIds: number[] = []

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db.rawQuery(
        `DELETE FROM business_units WHERE business_unit_id IN (${createdIds.join(',')}) LIMIT ${createdIds.length}`
      )
    }
  })

  test('empresa borrada libera su slug y otra empresa activa puede tomarlo', async ({ assert }) => {
    const service = makeService()
    const slug = `bu-ca2test${Date.now()}`

    // Paso 1: crear primera empresa con el slug
    const first = await service.create(buildBuData(slug, 'ca2-original'))
    createdIds.push(first.businessUnitId)

    // Paso 2: borrarla lógicamente (deletedAt ≠ NULL → slug_active = NULL)
    await first.delete()

    // Paso 3: crear segunda empresa con el mismo slug → debe persistir sin error
    let second: BusinessUnit | null = null
    second = await service.create(buildBuData(slug, 'ca2-reuso'))
    createdIds.push(second.businessUnitId)

    assert.equal(second.businessUnitSlug, slug)
    assert.notOk(second.deletedAt, 'la empresa nueva no debe estar borrada')
  })

  test('no se puede crear una segunda empresa activa mientras la primera sigue activa', async ({
    assert,
  }) => {
    const service = makeService()
    const slug = `bu-ca2block${Date.now()}`

    const first = await service.create(buildBuData(slug, 'ca2-block-first'))
    createdIds.push(first.businessUnitId)

    let caughtError: unknown
    try {
      const second = await service.create(buildBuData(slug, 'ca2-block-second'))
      createdIds.push(second.businessUnitId)
    } catch (error) {
      caughtError = error
    }

    assert.isTrue(
      service.isSlugDuplicateError(caughtError),
      'la segunda inserción debería haber fallado con duplicado de slug'
    )
  })
})

// ---------------------------------------------------------------------------
// CA-3 — el slug persiste exactamente como fue generado
// ---------------------------------------------------------------------------

test.group('business_unit_slug_unique — CA-3: slug opaco persistido verbatim', (group) => {
  const createdIds: number[] = []

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', createdIds).delete()
    }
  })

  test('el slug almacenado en la BD coincide carácter a carácter con el generado', async ({
    assert,
  }) => {
    const service = makeService()
    const slug = service.generateOpaqueSlug()

    const bu = await service.create(buildBuData(slug, `ca3-${Date.now()}`))
    createdIds.push(bu.businessUnitId)

    const fromDb = await BusinessUnit.findOrFail(bu.businessUnitId)
    assert.equal(
      fromDb.businessUnitSlug,
      slug,
      'el slug en BD difiere del slug pasado al create()'
    )
  })

  test('diez empresas distintas reciben diez slugs únicos en la BD', async ({ assert }) => {
    const service = makeService()
    const ids: number[] = []

    for (let i = 0; i < 10; i++) {
      const slug = service.generateOpaqueSlug()
      const bu = await service.create(buildBuData(slug, `ca3-multi-${i}-${Date.now()}`))
      ids.push(bu.businessUnitId)
    }
    createdIds.push(...ids)

    const slugs = await BusinessUnit.query()
      .whereIn('business_unit_id', ids)
      .select('businessUnitSlug')
    const uniqueSlugs = new Set(slugs.map((b) => b.businessUnitSlug))
    assert.equal(uniqueSlugs.size, 10, 'se esperaban 10 slugs distintos en la BD')
  })
})

// ---------------------------------------------------------------------------
// CA-4 — bucle espejo completa el alta antes de agotar intentos
// ---------------------------------------------------------------------------

test.group(
  'business_unit_slug_unique — CA-4: reintento espejo resuelve la colisión',
  (group) => {
    const createdIds: number[] = []

    group.teardown(async () => {
      if (createdIds.length > 0) {
        await BusinessUnit.query().whereIn('business_unit_id', createdIds).delete()
      }
    })

    test('el primer slug colisiona, el segundo (fresco) completa el INSERT', async ({ assert }) => {
      const service = makeService()
      const collidingSlug = service.generateOpaqueSlug()

      // Insertar la empresa que ocupa el slug colisionante
      const occupant = await service.create(buildBuData(collidingSlug, 'ca4-occupant'))
      createdIds.push(occupant.businessUnitId)

      // La secuencia le da el slug colisionante primero y uno fresco como fallback
      const freshSlug = service.generateOpaqueSlug()
      const slugSequence = [collidingSlug, freshSlug]

      const bu = await retryingCreate(service, slugSequence)
      createdIds.push(bu.businessUnitId)

      assert.equal(bu.businessUnitSlug, freshSlug, 'se esperaba el slug fresco del segundo intento')
      assert.isNotNull(bu.businessUnitId, 'la empresa debe haberse persistido')
    })

    test('el write_order es correcto: el primer intento falla con duplicado antes de reintentar', async ({
      assert,
    }) => {
      const service = makeService()
      const collidingSlug = service.generateOpaqueSlug()

      const occupant = await service.create(buildBuData(collidingSlug, 'ca4-order-occupant'))
      createdIds.push(occupant.businessUnitId)

      const events: string[] = []
      const slugSequence = [collidingSlug, service.generateOpaqueSlug()]

      for (const [idx, slug] of slugSequence.entries()) {
        const data = buildBuData(slug, `ca4-order-${idx}-${Date.now()}`)
        try {
          const bu = await service.create(data)
          createdIds.push(bu.businessUnitId)
          events.push(`ok:${idx}`)
          break
        } catch (error) {
          if (service.isSlugDuplicateError(error)) {
            events.push(`dup:${idx}`)
            if (idx + 1 >= BUSINESS_UNIT_SLUG_MAX_ATTEMPTS) throw error
            continue
          }
          throw error
        }
      }

      assert.deepEqual(events, ['dup:0', 'ok:1'], `write_order incorrecto: ${events.join(', ')}`)
    })
  }
)

// ---------------------------------------------------------------------------
// CA-5 — bucle espejo agota los intentos y lanza TNT.BU.SLUG_CONFLICT
// ---------------------------------------------------------------------------

test.group(
  'business_unit_slug_unique — CA-5: bucle espejo agota intentos y lanza SLUG_CONFLICT',
  (group) => {
    const createdIds: number[] = []

    group.teardown(async () => {
      if (createdIds.length > 0) {
        await BusinessUnit.query().whereIn('business_unit_id', createdIds).delete()
      }
    })

    test(`todos los ${BUSINESS_UNIT_SLUG_MAX_ATTEMPTS} intentos con slug ocupado → SlugExhaustedError`, async ({
      assert,
    }) => {
      const service = makeService()

      // Crear BUSINESS_UNIT_SLUG_MAX_ATTEMPTS empresas que ocupan los slugs
      const occupiedSlugs: string[] = []
      for (let i = 0; i < BUSINESS_UNIT_SLUG_MAX_ATTEMPTS; i++) {
        const slug = service.generateOpaqueSlug()
        const occupant = await service.create(buildBuData(slug, `ca5-occupant-${i}-${Date.now()}`))
        createdIds.push(occupant.businessUnitId)
        occupiedSlugs.push(slug)
      }

      // La secuencia entrega solo slugs ya ocupados → se agotan los intentos
      let caughtError: unknown
      try {
        await retryingCreate(service, occupiedSlugs)
      } catch (error) {
        caughtError = error
      }

      assert.instanceOf(caughtError, SlugExhaustedError)
      assert.equal(
        (caughtError as SlugExhaustedError).code,
        'TNT.BU.SLUG_CONFLICT',
        'se esperaba code TNT.BU.SLUG_CONFLICT al agotar los intentos'
      )
    })

    test('no se persiste empresa alguna cuando se agotan los intentos', async ({ assert }) => {
      const service = makeService()
      const stamp = Date.now()

      const occupiedSlugs: string[] = []
      for (let i = 0; i < BUSINESS_UNIT_SLUG_MAX_ATTEMPTS; i++) {
        const slug = service.generateOpaqueSlug()
        const occupant = await service.create(
          buildBuData(slug, `ca5-nopersist-occupant-${i}-${stamp}`)
        )
        createdIds.push(occupant.businessUnitId)
        occupiedSlugs.push(slug)
      }

      const countBefore = await BusinessUnit.query()
        .where('business_unit_name', 'like', `Test BU retry-%-${stamp}%`)
        .count('* as total')

      try {
        await retryingCreate(service, occupiedSlugs)
      } catch {
        // esperado
      }

      const countAfter = await BusinessUnit.query()
        .where('business_unit_name', 'like', `Test BU retry-%-${stamp}%`)
        .count('* as total')

      assert.equal(
        (countAfter[0].$extras.total as number) - (countBefore[0].$extras.total as number),
        0,
        'no deben haberse persistido empresas nuevas al agotar los intentos'
      )
    })
  }
)
