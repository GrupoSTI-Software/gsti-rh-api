import { fileURLToPath } from 'node:url'
import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'
import {
  TENANT_UNSCOPED_ORIGIN,
  TENANT_UNSCOPED_REASON,
  TENANT_UNSCOPED_REASON_POLICY,
} from '#constants/tenant_unscoped_reason'
import {
  inspectFiles,
  inspectTree,
  parseSource,
} from './tenant_unscoped_reason_contract_inspector.js'

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LOG_LEVELS = new Set(['debug', 'info', 'warn'])

const REQUIRED_KEYS = [
  'PLATFORM_ADMIN',
  'AUTH_OWN_SESSION',
  'BACKFILL_MAINTENANCE',
  'SEEDER',
  'TEST_FIXTURE',
  'REPORT_JOB',
] as const

test.group('Contrato runUnscoped — árbol app/ y commands/', () => {
  test('inspectTree no encuentra literales ni constantes fuera del catálogo', ({ assert }) => {
    const findings = inspectTree(fileURLToPath(app.appRoot).replace(/\/$/, ''))
    if (findings.length > 0) {
      const detail = findings
        .map((finding) => `${finding.location} [${finding.rule}] ${finding.text}`)
        .join('\n')
      assert.fail(`Hallazgos de contrato runUnscoped:\n${detail}`)
    }
    assert.deepEqual(findings, [])
  })

  test('autoprueba del verificador detecta las cuatro violaciones conocidas', ({ assert }) => {
    const fixture = `
      import { TenantContext } from '#utils/tenant_context'
      const LOCAL_REASON = 'texto libre'
      TenantContext.runUnscoped(() => {}, 'literal')
      TenantContext.runUnscoped(() => {}, \`plantilla\`)
      TenantContext.runUnscoped(() => {})
      TenantContext.runUnscoped(() => {}, LOCAL_REASON)
    `

    const findings = inspectFiles([parseSource('fixture.ts', fixture)])
    assert.lengthOf(findings, 4)
    assert.includeMembers(
      findings.map((finding) => finding.rule),
      ['literal-reason', 'missing-reason', 'reason-constant-not-from-catalog']
    )
  })
})

test.group('Contrato TENANT_UNSCOPED_REASON — catálogo y política', () => {
  test('valores únicos en kebab-case con política completa', ({ assert }) => {
    const values = Object.values(TENANT_UNSCOPED_REASON)
    assert.equal(new Set(values).size, values.length)

    for (const value of values) {
      assert.match(value, KEBAB_CASE)
      const policy = TENANT_UNSCOPED_REASON_POLICY[value]
      assert.exists(policy, `falta política para ${value}`)
      assert.include(TENANT_UNSCOPED_ORIGIN, policy.origin)
      assert.isTrue(LOG_LEVELS.has(policy.logLevel))
      assert.isString(policy.description)
      assert.isAbove(policy.description.length, 0)
    }
  })

  test('incluye claves obligatorias de R2-R4 y AUTH_OWN_SESSION en debug', ({ assert }) => {
    for (const key of REQUIRED_KEYS) {
      assert.property(TENANT_UNSCOPED_REASON, key)
      assert.property(TENANT_UNSCOPED_REASON_POLICY, TENANT_UNSCOPED_REASON[key])
    }

    assert.equal(TENANT_UNSCOPED_REASON_POLICY[TENANT_UNSCOPED_REASON.AUTH_OWN_SESSION].logLevel, 'debug')
  })
})
