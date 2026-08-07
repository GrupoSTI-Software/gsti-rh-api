import { test } from '@japa/runner'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { ROLE_PRESETS, getRolePreset } from '#constants/role_presets'

const grantableSlugs = new Set(
  EMPLOYEES_PERMISSION_CATALOG.filter((a) => !a.exemption).map((a) => a.slug)
)
const bySlug = new Map(EMPLOYEES_PERMISSION_CATALOG.map((a) => [a.slug, a]))

test.group('ROLE_PRESETS — integridad (USRH1785766406742)', () => {
  test('expone exactamente cuatro plantillas con slugs esperados', ({ assert }) => {
    assert.deepEqual(
      ROLE_PRESETS.map((p) => p.slug),
      ['hr-admin', 'branch-supervisor', 'read-only', 'data-entry']
    )
  })

  test('cada slug de plantilla existe en el catálogo grantable (no exemption)', ({ assert }) => {
    for (const preset of ROLE_PRESETS) {
      for (const slug of preset.permissionSlugs) {
        assert.isTrue(grantableSlugs.has(slug), `${preset.slug} → ${slug}`)
      }
    }
  })

  test('write implica read y delete implica write en la misma sección tab-*', ({ assert }) => {
    for (const preset of ROLE_PRESETS) {
      const set = new Set(preset.permissionSlugs)
      for (const slug of preset.permissionSlugs) {
        const m = /^tab-(.+)-(read|write|delete)$/.exec(slug)
        if (!m) continue
        const [, section, kind] = m
        if (kind === 'write') assert.isTrue(set.has(`tab-${section}-read`), slug)
        if (kind === 'delete') {
          assert.isTrue(set.has(`tab-${section}-write`), slug)
          assert.isTrue(set.has(`tab-${section}-read`), slug)
        }
      }
    }
  })

  test('read-only no concede write ni delete', ({ assert }) => {
    const preset = getRolePreset('read-only')
    for (const slug of preset.permissionSlugs) {
      const action = bySlug.get(slug)!
      assert.equal(action.kind, 'read', slug)
    }
  })

  test('cada plantilla tiene version semver no vacía y moduleSlug employees', ({ assert }) => {
    for (const preset of ROLE_PRESETS) {
      assert.match(preset.version, /^\d+\.\d+\.\d+$/)
      assert.equal(preset.moduleSlug, 'employees')
      assert.isAbove(preset.permissionSlugs.length, 0)
    }
  })
})
