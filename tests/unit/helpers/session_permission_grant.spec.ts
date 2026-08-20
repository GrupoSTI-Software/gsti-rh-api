import { test } from '@japa/runner'
import { isCatalogActionGranted } from '#helpers/session_permission_grant'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

const identificacionRead: Pick<ActionCatalogEntry<string>, 'slug' | 'legacyEquivalence'> = {
  slug: 'sensitive-identificacion-read',
  legacyEquivalence: {
    systemPermissionSlug: 'reveal-sensitive-data',
    relation: 'broader',
  },
}

const identificacionWrite: Pick<ActionCatalogEntry<string>, 'slug' | 'legacyEquivalence'> = {
  slug: 'sensitive-identificacion-write',
}

const tabTrabajoRead: Pick<ActionCatalogEntry<string>, 'slug' | 'legacyEquivalence'> = {
  slug: 'tab-trabajo-read',
  legacyEquivalence: { systemPermissionSlug: 'read', relation: 'broader' },
}

test.group('isCatalogActionGranted', () => {
  test('concede por el slug nuevo aunque el legacy broader no esté asignado', ({ assert }) => {
    const granted = new Set(['sensitive-identificacion-read', 'sensitive-identificacion-write'])

    assert.isTrue(isCatalogActionGranted(identificacionRead, granted))
    assert.isTrue(isCatalogActionGranted(identificacionWrite, granted))
  })

  test('concede lectura sensible si solo tiene el legacy broader', ({ assert }) => {
    const granted = new Set(['reveal-sensitive-data'])

    assert.isTrue(isCatalogActionGranted(identificacionRead, granted))
    assert.isFalse(isCatalogActionGranted(identificacionWrite, granted))
  })

  test('niega si no hay ni slug nuevo ni legacy', ({ assert }) => {
    assert.isFalse(isCatalogActionGranted(identificacionRead, new Set(['read'])))
  })

  test('el grant legacy read sigue abriendo tab-trabajo-read', ({ assert }) => {
    assert.isTrue(isCatalogActionGranted(tabTrabajoRead, new Set(['read'])))
    assert.isTrue(isCatalogActionGranted(tabTrabajoRead, new Set(['tab-trabajo-read'])))
  })
})
