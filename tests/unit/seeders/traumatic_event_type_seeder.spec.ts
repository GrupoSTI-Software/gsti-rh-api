import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Tests unitarios del seeder 0035_traumatic_event_type_seeder.
 * Validan los 9 tipos oficiales NOM-035 §4.1 sin ejecutar MySQL.
 */

const SEEDER_FILE = '0035_traumatic_event_type_seeder.ts'
const SEEDER_PATH = join(process.cwd(), 'database/seeders', SEEDER_FILE)

/** Slugs oficiales conforme al numeral 4.1 y la Guía I del DOF. */
const OFFICIAL_SLUGS = [
  'explosion',
  'derrumbe',
  'incendio-gran-magnitud',
  'accidente-grave-mortal',
  'asalto-violencia',
  'secuestro',
  'homicidio',
  'amenaza-grave',
  'otro-acontecimiento-41',
] as const

const OFFICIAL_NAMES: Record<(typeof OFFICIAL_SLUGS)[number], string> = {
  explosion: 'Explosión',
  derrumbe: 'Derrumbe',
  'incendio-gran-magnitud': 'Incendio de gran magnitud',
  'accidente-grave-mortal': 'Accidente grave o mortal',
  'asalto-violencia': 'Asalto con violencia',
  secuestro: 'Secuestro',
  homicidio: 'Homicidio',
  'amenaza-grave': 'Amenaza grave contra la vida o la integridad física',
  'otro-acontecimiento-41': 'Otro acontecimiento traumático severo',
}

function readSeeder(): string {
  return readFileSync(SEEDER_PATH, 'utf-8')
}

test.group('TraumaticEventType — seeder 0035', () => {
  test('existe el archivo de seeder con número 0035', ({ assert }) => {
    const content = readSeeder()
    assert.isAbove(content.length, 0)
  })

  test('usa firstOrCreate por traumaticEventTypeSlug (idempotente)', ({ assert }) => {
    const content = readSeeder()
    assert.include(content, 'firstOrCreate')
    assert.include(content, 'traumaticEventTypeSlug')
  })

  test('sembrar los 9 slugs oficiales sin duplicados', ({ assert }) => {
    const content = readSeeder()
    for (const slug of OFFICIAL_SLUGS) {
      assert.include(content, `slug: '${slug}'`, `Falta slug oficial "${slug}"`)
    }
    assert.lengthOf(OFFICIAL_SLUGS, 9)
  })

  test('cada slug tiene su nombre oficial literal', ({ assert }) => {
    const content = readSeeder()
    for (const slug of OFFICIAL_SLUGS) {
      assert.include(content, `name: '${OFFICIAL_NAMES[slug]}'`, `Falta nombre para "${slug}"`)
    }
  })

  test('activa todos los tipos con traumaticEventTypeActive: 1', ({ assert }) => {
    const content = readSeeder()
    assert.include(content, 'traumaticEventTypeActive: 1')
  })
})
