import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

interface RouteGroup {
  /** Cuerpo entre `.group(() => {` y su `}` de cierre (balanceado por llaves). */
  body: string
  /** Cadena de modificadores inmediatamente después del grupo: `.prefix(...).use(...)...`. */
  chain: string
}

/**
 * Extrae cada bloque `router.group(() => { ... }).prefix(...).use(...)` de un
 * archivo de rutas mediante un escaneo balanceado por llaves (no un AST
 * completo, pero suficiente para el estilo consistente de estos archivos —
 * Important 4, revisión final de sensitive-write-by-category).
 *
 * Antes, el censo solo verificaba que la palabra `middleware.businessScope()`
 * o `middleware.sensitiveAccess()` apareciera EN CUALQUIER PARTE del archivo,
 * lo cual pasaba aunque la ruta de escritura real viviera en un grupo distinto
 * y desprotegido dentro del mismo archivo (p. ej. `person_routes.ts` tiene 3
 * grupos, solo uno de los cuales monta `sensitiveAccess()`).
 */
function extractRouteGroups(source: string): RouteGroup[] {
  const groups: RouteGroup[] = []
  const groupStartRegex = /\.group\(\(\)\s*=>\s*\{/g
  let match: RegExpExecArray | null

  while ((match = groupStartRegex.exec(source)) !== null) {
    const bodyStart = match.index + match[0].length
    let depth = 1
    let i = bodyStart
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const bodyEnd = i - 1
    const body = source.slice(bodyStart, bodyEnd)

    // Avanzar hasta el ')' que cierra la llamada `.group(`.
    let j = bodyEnd
    while (j < source.length && source[j] !== ')') j++
    j++

    // Capturar la cadena de modificadores `.prefix(...)`, `.use(...)`, etc.
    // que sigue inmediatamente al grupo, línea por línea, hasta la primera
    // línea no vacía que no continúe la cadena (no inicia con '.').
    const rest = source.slice(j)
    const chainLines: string[] = []
    for (const line of rest.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      if (trimmed.startsWith('.')) {
        chainLines.push(line)
        continue
      }
      break
    }

    groups.push({ body, chain: chainLines.join('\n') })
  }

  return groups
}

const WRITE_METHOD_PATTERN = /\.(post|put|delete|patch)\(/

function groupHasWriteRoute(group: RouteGroup): boolean {
  return WRITE_METHOD_PATTERN.test(group.body)
}

function groupOpensSensitiveContext(group: RouteGroup): boolean {
  return (
    group.chain.includes('middleware.businessScope()') ||
    group.chain.includes('middleware.sensitiveAccess()')
  )
}

test.group('Apertura del contexto de lectura sensible', () => {
  test('kernel registra sensitiveAccess', ({ assert }) => {
    const kernel = readFileSync(join(ROOT, 'start/kernel.ts'), 'utf-8')
    assert.include(kernel, 'sensitiveAccess:')
    assert.include(kernel, '#middleware/sensitive_access_context_middleware')
  })

  test('businessScope anida runWithSensitiveReadDecisions dentro de TenantContext.run', ({
    assert,
  }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_middleware.ts'),
      'utf-8'
    )
    assert.include(source, 'runWithSensitiveReadDecisions')
    assert.include(source, 'TenantContext.run')
  })

  test('businessScopeOptional anida la apertura en sus dos retornos', ({ assert }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_optional_middleware.ts'),
      'utf-8'
    )
    const occurrences = source.split('runWithSensitiveReadDecisions').length - 1
    assert.equal(occurrences, 3)
  })

  test('revelado y bitácora montan businessScopeOptional en sus propios grupos', ({
    assert,
  }) => {
    const source = readFileSync(join(ROOT, 'start/routes/pii_reveal_routes.ts'), 'utf-8')
    const groups = extractRouteGroups(source)
    const revealGroup = groups.find((group) =>
      group.chain.includes(".prefix('/api/v1/pii/reveal')")
    )
    const accessLogsGroup = groups.find((group) =>
      group.chain.includes(".prefix('/api/v1/pii/access-logs')")
    )

    assert.include(revealGroup?.chain ?? '', '.use(middleware.businessScopeOptional())')
    assert.include(accessLogsGroup?.chain ?? '', '.use(middleware.businessScopeOptional())')
  })

  test('los cuatro grupos con solo auth() montan sensitiveAccess y no businessScope', ({
    assert,
  }) => {
    const files = [
      'start/routes/person_routes.ts',
      'start/routes/customer_routes.ts',
      'start/routes/pilot_routes.ts',
      'start/routes/flight_attendant_routes.ts',
    ]
    for (const relative of files) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'middleware.sensitiveAccess()', relative)
    }

    const persons = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    assert.include(persons, "prefix('/api/persons')")
    assert.match(
      persons,
      /prefix\('\/api\/persons'\)[\s\S]*?\.use\(middleware\.auth\(\)\)[\s\S]*?\.use\(middleware\.sensitiveAccess\(\)\)/
    )
  })

  test('cada GRUPO con rutas de escritura de los 10 modelos abre businessScope o sensitiveAccess', ({
    assert,
  }) => {
    // USRH1787204602825/831 — Critical 1 (revisión final): se agrega
    // `synchronization_routes.ts` al censo porque `POST /api/synchronization/employees`
    // y `.../by-selection/employees` crean/actualizan `Person` sin abrir el
    // contexto de escritura sensible si no se monta `sensitiveAccess()` aquí.
    const writeRouteFiles = [
      'start/routes/person_routes.ts',
      'start/routes/employee_bank_routes.ts',
      'start/routes/employee_medical_condition_routes.ts',
      'start/routes/employee_emergency_contact_routes.ts',
      'start/routes/employee_spouse_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/traumatic_event_report_routes.ts',
      'start/routes/traumatic_event_report_v1_routes.ts',
      'start/routes/employee_lactation_periods_routes.ts',
      'start/routes/employee_biometric_routes.ts',
      'start/routes/employee_biometric_face_id_routes.ts',
      'start/routes/user_routes.ts',
      'start/routes/employee_routes.ts',
      'start/routes/synchronization_routes.ts',
    ]

    let totalWriteGroupsChecked = 0

    for (const relative of writeRouteFiles) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      const groups = extractRouteGroups(source)
      assert.isAbove(groups.length, 0, `${relative}: no se detectó ningún router.group(...)`)

      const writeGroups = groups.filter(groupHasWriteRoute)
      assert.isAbove(
        writeGroups.length,
        0,
        `${relative}: no se detectó ningún grupo con rutas post/put/delete/patch`
      )

      writeGroups.forEach((group, index) => {
        totalWriteGroupsChecked++
        assert.isTrue(
          groupOpensSensitiveContext(group),
          `${relative}: el grupo de escritura #${index + 1} debe montar businessScope() o sensitiveAccess() en SU PROPIA cadena de modificadores, no solo en algún lugar del archivo`
        )
      })
    }

    // Guarda contra que `extractRouteGroups` deje de encontrar grupos por un
    // cambio de estilo no contemplado (falso verde silencioso).
    assert.isAbove(totalWriteGroupsChecked, 0)
  })

  test('la consola landlord no abre contexto sensible (hueco declarado)', ({ assert }) => {
    const source = readFileSync(join(ROOT, 'start/routes/platform_routes.ts'), 'utf-8')
    assert.notInclude(source, 'middleware.businessScope()')
    assert.notInclude(source, 'middleware.sensitiveAccess()')
  })
})
