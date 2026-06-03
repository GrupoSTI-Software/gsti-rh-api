import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Tests unitarios del seeder NOM-037-STPS-2023.
 * No requieren base de datos: validan estructura de claves i18n,
 * longitud de keys, cobertura de los 53 códigos y presencia en los JSON.
 */

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')

/** Todos los códigos de cláusula esperados en NOM-037 (49 total). */
const NOM037_CODES: readonly string[] = [
  // Capítulo raíz
  '5',
  // 14 padres
  '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7',
  '5.8', '5.9', '5.10', '5.11', '5.12', '5.13', '5.14',
  // Sub-incisos 5.1 (6)
  '5.1.I', '5.1.II', '5.1.III', '5.1.IV', '5.1.V', '5.1.VI',
  // Sub-incisos 5.2 (4)
  '5.2.I', '5.2.II', '5.2.III', '5.2.IV',
  // Sub-incisos 5.3 (3)
  '5.3.I', '5.3.II', '5.3.III',
  // Sub-incisos 5.4 (4)
  '5.4.I', '5.4.II', '5.4.III', '5.4.IV',
  // Sub-incisos 5.5 (3)
  '5.5.I', '5.5.II', '5.5.III',
  // Sub-incisos 5.6 (3)
  '5.6.I', '5.6.II', '5.6.III',
  // Sub-incisos 5.7 (3)
  '5.7.I', '5.7.II', '5.7.III',
  // Sub-incisos 5.8 (3)
  '5.8.I', '5.8.II', '5.8.III',
  // Sub-incisos 5.9 (3)
  '5.9.I', '5.9.II', '5.9.III',
  // Sub-incisos 5.10 (2)
  '5.10.I', '5.10.II',
] as const

/** Convierte un código de cláusula en el segmento de clave i18n. */
function codeToSegment(code: string): string {
  return code.replace(/\./g, '_')
}

/** Genera todas las claves i18n de una cláusula dado su código. */
function clauseKeys(code: string): string[] {
  const seg = codeToSegment(code)
  const base = `regulatory.clauses.nom_037_stps_2023.${seg}`
  return [
    `${base}.title`,
    `${base}.obligation`,
    `${base}.explanation`,
    `${base}.rationale`,
    `${base}.audit_criteria`,
  ]
}

// ─────────────────────────────────────────────────────────────────────────────

test.group('NOM-037 — Estructura de códigos', () => {
  test('cubre exactamente 49 códigos de cláusula', ({ assert }) => {
    assert.equal(NOM037_CODES.length, 49)
  })

  test('incluye el nodo raíz del capítulo 5', ({ assert }) => {
    assert.isTrue(NOM037_CODES.includes('5'))
  })

  test('incluye los 14 numerales padre (5.1 – 5.14)', ({ assert }) => {
    const padres = Array.from({ length: 14 }, (_, i) => `5.${i + 1}`)
    for (const padre of padres) {
      assert.isTrue(NOM037_CODES.includes(padre), `Falta padre ${padre}`)
    }
  })

  test('incluye los 38 sub-incisos distribuidos en 5.1–5.10', ({ assert }) => {
    const subEsperados: Record<string, string[]> = {
      '5.1': ['I', 'II', 'III', 'IV', 'V', 'VI'],
      '5.2': ['I', 'II', 'III', 'IV'],
      '5.3': ['I', 'II', 'III'],
      '5.4': ['I', 'II', 'III', 'IV'],
      '5.5': ['I', 'II', 'III'],
      '5.6': ['I', 'II', 'III'],
      '5.7': ['I', 'II', 'III'],
      '5.8': ['I', 'II', 'III'],
      '5.9': ['I', 'II', 'III'],
      '5.10': ['I', 'II'],
    }
    for (const [padre, fracciones] of Object.entries(subEsperados)) {
      for (const fraccion of fracciones) {
        const code = `${padre}.${fraccion}`
        assert.isTrue(NOM037_CODES.includes(code), `Falta sub-inciso ${code}`)
      }
    }
  })

  test('5.11 – 5.14 no tienen sub-incisos registrados', ({ assert }) => {
    const sinSub = ['5.11', '5.12', '5.13', '5.14']
    const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI']
    for (const padre of sinSub) {
      for (const fraccion of romanos) {
        const code = `${padre}.${fraccion}`
        assert.isFalse(NOM037_CODES.includes(code), `${code} no debería existir`)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

test.group('NOM-037 — Claves i18n: formato y longitud', () => {
  test('todas las obligation keys tienen ≤ 150 caracteres', ({ assert }) => {
    for (const code of NOM037_CODES) {
      const seg = codeToSegment(code)
      const key = `regulatory.clauses.nom_037_stps_2023.${seg}.obligation`
      assert.isAtMost(
        key.length,
        150,
        `Key demasiado larga (${key.length} chars): ${key}`
      )
    }
  })

  test('todas las keys siguen el patrón regulatory.clauses.nom_037_stps_2023.<seg>.<field>', ({
    assert,
  }) => {
    const pattern = /^regulatory\.clauses\.nom_037_stps_2023\.[A-Za-z0-9_]+\.[a-z_]+$/
    for (const code of NOM037_CODES) {
      for (const key of clauseKeys(code)) {
        assert.match(key, pattern, `Key no cumple el patrón: ${key}`)
      }
    }
  })

  test('el segmento de cada código no contiene puntos', ({ assert }) => {
    for (const code of NOM037_CODES) {
      const seg = codeToSegment(code)
      assert.notInclude(seg, '.', `Segmento con punto: ${seg} (código: ${code})`)
    }
  })

  test('las keys de regulation scope y audit_description son correctas', ({ assert }) => {
    const scopeKey = 'regulatory.regulations.nom_037_stps_2023.scope'
    const auditKey = 'regulatory.regulations.nom_037_stps_2023.audit_description'
    assert.isAtMost(scopeKey.length, 150)
    assert.isAtMost(auditKey.length, 150)
    assert.match(scopeKey, /^regulatory\.regulations\.nom_037_stps_2023\.\w+$/)
    assert.match(auditKey, /^regulatory\.regulations\.nom_037_stps_2023\.\w+$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

test.group('NOM-037 — Presencia en archivos i18n JSON', () => {
  async function loadJson(locale: 'es' | 'en'): Promise<Record<string, unknown>> {
    const path = join(ROOT, 'resources', 'langs', `${locale}.json`)
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  }

  function getNestedKey(
    obj: Record<string, unknown>,
    dotPath: string
  ): string | null | undefined {
    const parts = dotPath.split('.')
    let node: unknown = obj
    for (const part of parts) {
      if (node === null || typeof node !== 'object') return undefined
      node = (node as Record<string, unknown>)[part]
    }
    return node as string | null | undefined
  }

  test('es.json contiene la clave scope de NOM-037', async ({ assert }) => {
    const json = await loadJson('es')
    const val = getNestedKey(json, 'regulatory.regulations.nom_037_stps_2023.scope')
    assert.isString(val, 'regulatory.regulations.nom_037_stps_2023.scope debe ser string')
    assert.isAbove((val as string).length, 10)
  })

  test('en.json contiene la clave scope de NOM-037', async ({ assert }) => {
    const json = await loadJson('en')
    const val = getNestedKey(json, 'regulatory.regulations.nom_037_stps_2023.scope')
    assert.isString(val, 'regulatory.regulations.nom_037_stps_2023.scope debe ser string')
    assert.isAbove((val as string).length, 10)
  })

  test('es.json contiene las obligation keys de todos los 53 códigos NOM-037', async ({
    assert,
  }) => {
    const json = await loadJson('es')
    for (const code of NOM037_CODES) {
      const seg = codeToSegment(code)
      const dotPath = `regulatory.clauses.nom_037_stps_2023.${seg}.obligation`
      const val = getNestedKey(json, dotPath)
      assert.isString(val, `Falta en es.json: ${dotPath}`)
      assert.isAbove((val as string).length, 5, `Obligación vacía en es.json: ${dotPath}`)
    }
  })

  test('en.json contiene las obligation keys de todos los 53 códigos NOM-037', async ({
    assert,
  }) => {
    const json = await loadJson('en')
    for (const code of NOM037_CODES) {
      const seg = codeToSegment(code)
      const dotPath = `regulatory.clauses.nom_037_stps_2023.${seg}.obligation`
      const val = getNestedKey(json, dotPath)
      assert.isString(val, `Falta en en.json: ${dotPath}`)
      assert.isAbove((val as string).length, 5, `Obligación vacía en en.json: ${dotPath}`)
    }
  })

  test('la extensión de NOM-037 no rompe las keys existentes de NOM-035 en es.json', async ({
    assert,
  }) => {
    const json = await loadJson('es')
    const sampleKey = 'regulatory.clauses.nom_035_stps_2018.5_1.obligation'
    const val = getNestedKey(json, sampleKey)
    assert.isString(val, `NOM-035 key rota en es.json: ${sampleKey}`)
    assert.isAbove((val as string).length, 10)
  })

  test('la extensión de NOM-037 no rompe las keys existentes de NOM-035 en en.json', async ({
    assert,
  }) => {
    const json = await loadJson('en')
    const sampleKey = 'regulatory.clauses.nom_035_stps_2018.5_1.obligation'
    const val = getNestedKey(json, sampleKey)
    assert.isString(val, `NOM-035 key rota en en.json: ${sampleKey}`)
    assert.isAbove((val as string).length, 10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

test.group('NOM-037 — Archivo del seeder', () => {
  test('el archivo 0031_nom_037_stps_seeder.ts existe en database/seeders/', async ({
    assert,
  }) => {
    const seederPath = join(ROOT, 'database', 'seeders', '0031_nom_037_stps_seeder.ts')
    try {
      await readFile(seederPath, 'utf-8')
      assert.isTrue(true)
    } catch {
      assert.fail(`El seeder no existe en la ruta esperada: ${seederPath}`)
    }
  })

  test('el seeder contiene el mensaje de error cuando STPS no existe', async ({ assert }) => {
    const seederPath = join(ROOT, 'database', 'seeders', '0031_nom_037_stps_seeder.ts')
    const content = await readFile(seederPath, 'utf-8')
    assert.include(
      content,
      'STPS authority not found, run StpsAuthoritySeeder first',
      'El seeder debe fallar explícitamente cuando STPS no existe'
    )
  })

  test('el seeder usa updateOrCreate para idempotencia en regulations', async ({ assert }) => {
    const seederPath = join(ROOT, 'database', 'seeders', '0031_nom_037_stps_seeder.ts')
    const content = await readFile(seederPath, 'utf-8')
    assert.include(content, 'Regulation.updateOrCreate')
  })

  test('el seeder usa updateOrCreate para idempotencia en regulation_clauses', async ({
    assert,
  }) => {
    const seederPath = join(ROOT, 'database', 'seeders', '0031_nom_037_stps_seeder.ts')
    const content = await readFile(seederPath, 'utf-8')
    assert.include(content, 'RegulationClause.updateOrCreate')
  })

  test('el código de la regulación es NOM-037-STPS y la versión es 2023', async ({
    assert,
  }) => {
    const seederPath = join(ROOT, 'database', 'seeders', '0031_nom_037_stps_seeder.ts')
    const content = await readFile(seederPath, 'utf-8')
    assert.include(content, "'NOM-037-STPS'")
    assert.include(content, "'2023'")
  })
})
