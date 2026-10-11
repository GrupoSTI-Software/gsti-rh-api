import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  latestPublishedAt,
  publishedPermissionKeys,
  selectDeckSlides,
  type DeckCandidate,
} from '#modules/announcements/domain/deck_selection'

/**
 * Selección del deck de anuncios (`GET /api/announcements/me/deck`). Función pura:
 * sin BD ni reloj.
 */

const BASE = DateTime.fromISO('2026-10-01T12:00:00.000Z', { zone: 'utc' })
const NONE: ReadonlySet<string> = new Set()

function slide(overrides: Partial<DeckCandidate> & { id: number }): DeckCandidate {
  return {
    type: 'feature',
    sortOrder: 0,
    status: 'published',
    publishedAt: BASE,
    permissionKey: null,
    ...overrides,
  }
}

function ids(slides: DeckCandidate[]): number[] {
  return slides.map((s) => s.id)
}

test.group('Anuncios | selectDeckSlides - primer ingreso (sin marca)', () => {
  test('solo onboarding, por sortOrder asc e id asc', ({ assert }) => {
    const slides = [
      slide({ id: 4, type: 'onboarding', sortOrder: 2 }),
      slide({ id: 1, type: 'onboarding', sortOrder: 1 }),
      slide({ id: 3, type: 'onboarding', sortOrder: 1 }),
      slide({ id: 2, type: 'feature', sortOrder: 0 }),
    ]
    assert.deepEqual(ids(selectDeckSlides(slides, null, NONE)), [1, 3, 4])
  })

  test('tope de cinco: conserva los primeros por sortOrder', ({ assert }) => {
    const slides = [7, 6, 5, 4, 3, 2, 1].map((n) =>
      slide({ id: n, type: 'onboarding', sortOrder: n })
    )
    assert.deepEqual(ids(selectDeckSlides(slides, null, NONE)), [1, 2, 3, 4, 5])
  })
})

test.group('Anuncios | selectDeckSlides - novedades tras la marca', () => {
  test('solo feature publicadas estrictamente después de la marca, por publishedAt asc', ({
    assert,
  }) => {
    const mark = BASE.plus({ days: 1 })
    const slides = [
      slide({ id: 1, publishedAt: BASE }),
      slide({ id: 2, publishedAt: mark }), // igual a la marca: ya visto
      slide({ id: 3, publishedAt: mark.plus({ milliseconds: 1 }) }),
      slide({ id: 4, publishedAt: mark.plus({ days: 2 }) }),
      slide({ id: 5, publishedAt: mark.plus({ days: 1 }) }),
      slide({ id: 6, type: 'onboarding', publishedAt: mark.plus({ days: 3 }) }),
    ]
    assert.deepEqual(ids(selectDeckSlides(slides, mark, NONE)), [3, 5, 4])
  })

  test('misma publishedAt: desempata por sortOrder', ({ assert }) => {
    const mark = BASE.minus({ days: 1 })
    const slides = [
      slide({ id: 1, sortOrder: 3 }),
      slide({ id: 2, sortOrder: 1 }),
      slide({ id: 3, sortOrder: 2 }),
    ]
    assert.deepEqual(ids(selectDeckSlides(slides, mark, NONE)), [2, 3, 1])
  })

  test('tope de cinco: conserva los cinco más recientes en orden ascendente', ({ assert }) => {
    const mark = BASE.minus({ days: 1 })
    const slides = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      slide({ id: n, publishedAt: BASE.plus({ hours: n }) })
    )
    assert.deepEqual(ids(selectDeckSlides(slides, mark, NONE)), [3, 4, 5, 6, 7])
  })

  test('nada nuevo: deck vacío', ({ assert }) => {
    const slides = [slide({ id: 1 })]
    assert.deepEqual(selectDeckSlides(slides, BASE.plus({ days: 1 }), NONE), [])
  })
})

test.group('Anuncios | selectDeckSlides - estado y permisos', () => {
  test('excluye borradores y archivados', ({ assert }) => {
    const slides = [
      slide({ id: 1, type: 'onboarding', status: 'draft', publishedAt: null }),
      slide({ id: 2, type: 'onboarding', status: 'archived' }),
      slide({ id: 3, type: 'onboarding', status: 'published' }),
    ]
    assert.deepEqual(ids(selectDeckSlides(slides, null, NONE)), [3])
  })

  test('slide con permiso: solo si la clave está concedida', ({ assert }) => {
    const slides = [
      slide({ id: 1, type: 'onboarding', sortOrder: 1 }),
      slide({ id: 2, type: 'onboarding', sortOrder: 2, permissionKey: 'modulo-a:leer' }),
      slide({ id: 3, type: 'onboarding', sortOrder: 3, permissionKey: 'modulo-b:leer' }),
    ]
    assert.deepEqual(ids(selectDeckSlides(slides, null, NONE)), [1])
    assert.deepEqual(ids(selectDeckSlides(slides, null, new Set(['modulo-a:leer']))), [1, 2])
  })

  test('el permiso también filtra las novedades', ({ assert }) => {
    const mark = BASE.minus({ days: 1 })
    const slides = [slide({ id: 1, permissionKey: 'modulo-a:leer' })]
    assert.deepEqual(selectDeckSlides(slides, mark, NONE), [])
    assert.deepEqual(ids(selectDeckSlides(slides, mark, new Set(['modulo-a:leer']))), [1])
  })
})

test.group('Anuncios | latestPublishedAt y publishedPermissionKeys', () => {
  test('latestPublishedAt: máximo entre publicados de cualquier tipo y permiso', ({ assert }) => {
    const latest = BASE.plus({ days: 5 })
    const slides = [
      slide({ id: 1, type: 'onboarding' }),
      slide({ id: 2, publishedAt: latest, permissionKey: 'modulo-a:leer' }),
      slide({ id: 3, status: 'archived', publishedAt: BASE.plus({ days: 9 }) }),
      slide({ id: 4, status: 'draft', publishedAt: null }),
    ]
    assert.equal(latestPublishedAt(slides)?.toMillis(), latest.toMillis())
  })

  test('latestPublishedAt: null sin publicados', ({ assert }) => {
    assert.isNull(latestPublishedAt([slide({ id: 1, status: 'draft', publishedAt: null })]))
  })

  test('publishedPermissionKeys: claves distintas solo de publicados', ({ assert }) => {
    const slides = [
      slide({ id: 1, permissionKey: 'modulo-a:leer' }),
      slide({ id: 2, permissionKey: 'modulo-a:leer' }),
      slide({ id: 3, status: 'draft', publishedAt: null, permissionKey: 'modulo-b:leer' }),
      slide({ id: 4 }),
    ]
    assert.deepEqual(publishedPermissionKeys(slides), ['modulo-a:leer'])
  })
})
