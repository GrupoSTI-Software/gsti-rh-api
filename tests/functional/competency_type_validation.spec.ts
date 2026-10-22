import { test } from '@japa/runner'
import type { ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import Competency from '#models/competency'
import SystemModule from '#models/system_module'
import { TenantContext } from '#utils/tenant_context'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * VLRH-H1792175042593 — Rechazar un tipo de competencia desconocido.
 *
 * CA-1: GET con tipo fuera del enum → 422 CMPT.VAL.001, campo competencyType.
 * CA-2: GET sin tipo o con tipo vacío → 200 con todo el catálogo.
 * CA-3: GET con technical o functional → 200 solo de ese tipo.
 * CA-4: POST con tipo inválido → 422 y no guarda nada.
 * CA-5: POST con nombre vacío → 422, campo competencyName, message fijo (no 500).
 * CA-6: PUT con tipo inválido → 422 y la fila no cambia.
 * CA-7: alta válida → 201; sin permiso + cuerpo inválido → PERM.DENIED (no 422).
 */

const MODULE = 'competencies'
const GRANTS = ['create', 'read', 'update', 'delete'] as const

async function createCompetency(actor: TenantActor, type: 'technical' | 'functional', label: string) {
  return TenantContext.run([actor.businessUnit.businessUnitId], () =>
    Competency.create({ competencyName: uniqueTestName(`VAL-${type}-${label}`).slice(0, 255), competencyType: type })
  )
}

async function cleanup(actor: TenantActor | null) {
  if (!actor) return
  const buId = actor.businessUnit.businessUnitId
  await db.from('competencies').where('business_unit_id', buId).delete()
}

/**
 * Comprueba el cuerpo exacto del 422 de competencias (§11.1 del spec).
 */
function assert422(assert: Assert, res: ApiResponse, expectedField: string) {
  res.assertStatus(422)
  const body = res.body()
  assert.equal(body.type, 'error')
  assert.equal(body.key, 'datos-no-validos')
  assert.equal(body.code, 'CMPT.VAL.001')
  assert.equal(body.message, 'Los datos enviados no son válidos. Revisa los campos marcados.')
  assert.isArray(body.errors)
  assert.isTrue(body.errors.length > 0, 'errors debe tener al menos un elemento')
  const fields: string[] = body.errors.map((e: { field: string }) => e.field)
  assert.include(fields, expectedField, `errors debe contener el campo ${expectedField}`)
  assert.isUndefined(body.data, 'el cuerpo de 422 no debe incluir data.competencies')
}

test.group('Competencias — validación de tipo (VLRH-H1792175042593)', (group) => {
  let mod: SystemModule | null = null
  let prevActive = 0
  let prevEnforce = true
  let actor: TenantActor | null = null
  let technical: Competency | null = null
  let functional: Competency | null = null

  group.setup(async () => {
    mod = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', MODULE)
      .firstOrFail()
    prevActive = mod.systemModuleActive
    prevEnforce = mod.systemModulePermissionEnforcementActive
    mod.systemModuleActive = 1
    mod.systemModulePermissionEnforcementActive = true
    await mod.save()

    actor = await createTenantActor('val-tipo')
    await grantModulePermissions(actor, MODULE, GRANTS)
    technical = await createCompetency(actor, 'technical', 'T')
    functional = await createCompetency(actor, 'functional', 'F')
  })

  group.teardown(async () => {
    await cleanup(actor)
    await cleanupTenantActor(actor)
    if (mod) {
      mod.systemModuleActive = prevActive
      mod.systemModulePermissionEnforcementActive = prevEnforce
      await mod.save()
    }
  })

  // ── CA-1 ──────────────────────────────────────────────────────────────────
  test('CA-1a: GET con competencyType=value → 422 CMPT.VAL.001 campo competencyType', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const res = await client
      .get('/api/competencies?page=1&limit=100&competencyType=value')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    assert422(assert, res, 'competencyType')
  })

  test('CA-1b: GET con competencyType=transversal → 422', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const res = await client
      .get('/api/competencies?page=1&limit=100&competencyType=transversal')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    assert422(assert, res, 'competencyType')
  })

  test('CA-1c: GET con competencyType=TECHNICAL (mayúsculas) → 422', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const res = await client
      .get('/api/competencies?page=1&limit=100&competencyType=TECHNICAL')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    assert422(assert, res, 'competencyType')
  })

  // ── CA-2 ──────────────────────────────────────────────────────────────────
  test('CA-2a: GET sin competencyType → 200 con las dos competencias del actor', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const t = required(technical, 'técnica')
    const f = required(functional, 'funcional')
    const res = await client
      .get('/api/competencies?page=1&limit=200')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    res.assertStatus(200)
    const ids: number[] = (res.body().data?.competencies?.data ?? []).map(
      (c: { competencyId: number }) => c.competencyId
    )
    assert.include(ids, t.competencyId)
    assert.include(ids, f.competencyId)
  })

  test('CA-2b: GET con competencyType vacío → 200 con las dos competencias', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const t = required(technical, 'técnica')
    const f = required(functional, 'funcional')
    const res = await client
      .get('/api/competencies?page=1&limit=200&competencyType=')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    res.assertStatus(200)
    const ids: number[] = (res.body().data?.competencies?.data ?? []).map(
      (c: { competencyId: number }) => c.competencyId
    )
    assert.include(ids, t.competencyId)
    assert.include(ids, f.competencyId)
  })

  // ── CA-3 ──────────────────────────────────────────────────────────────────
  test('CA-3a: GET con competencyType=functional → 200 solo la funcional', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const t = required(technical, 'técnica')
    const f = required(functional, 'funcional')
    const res = await client
      .get('/api/competencies?page=1&limit=200&competencyType=functional')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    res.assertStatus(200)
    const ids: number[] = (res.body().data?.competencies?.data ?? []).map(
      (c: { competencyId: number }) => c.competencyId
    )
    assert.include(ids, f.competencyId)
    assert.notInclude(ids, t.competencyId)
  })

  test('CA-3b: GET con competencyType=technical → 200 solo la técnica', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const t = required(technical, 'técnica')
    const f = required(functional, 'funcional')
    const res = await client
      .get('/api/competencies?page=1&limit=200&competencyType=technical')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    res.assertStatus(200)
    const ids: number[] = (res.body().data?.competencies?.data ?? []).map(
      (c: { competencyId: number }) => c.competencyId
    )
    assert.include(ids, t.competencyId)
    assert.notInclude(ids, f.competencyId)
  })

  // ── CA-4 ──────────────────────────────────────────────────────────────────
  test('CA-4: POST con competencyType=value → 422 y el conteo no cambia', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const antes = await TenantContext.runUnscoped(
      () => db.from('competencies').where('business_unit_id', a.businessUnit.businessUnitId).count('* as total'),
      'conteo antes CA-4'
    )
    const countAntes = Number(antes[0].total)

    const res = await client
      .post('/api/competencies')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ competencyName: 'Negociacion', competencyType: 'value' })
    assert422(assert, res, 'competencyType')

    const despues = await TenantContext.runUnscoped(
      () => db.from('competencies').where('business_unit_id', a.businessUnit.businessUnitId).count('* as total'),
      'conteo despues CA-4'
    )
    assert.equal(Number(despues[0].total), countAntes, 'no debe crearse ninguna fila')
  })

  // ── CA-5 ──────────────────────────────────────────────────────────────────
  test('CA-5: POST con nombre vacío → 422, campo competencyName, message fijo (no 500)', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const res = await client
      .post('/api/competencies')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ competencyName: '', competencyType: 'technical' })
    assert422(assert, res, 'competencyName')
    // Verificar que el message es el fijo del área, no el texto de "error inesperado"
    assert.notInclude(
      res.body().message as string,
      'inesperado',
      'message no debe contener el texto del error de servidor'
    )
  })

  // ── CA-6 ──────────────────────────────────────────────────────────────────
  test('CA-6: PUT con competencyType=value → 422 y la fila no cambia', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const t = required(technical, 'técnica')
    const nombreOriginal = t.competencyName

    const res = await client
      .put(`/api/competencies/${t.competencyId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ competencyName: t.competencyName, competencyType: 'value' })
    assert422(assert, res, 'competencyType')

    const fila = await TenantContext.runUnscoped(
      () => Competency.findOrFail(t.competencyId),
      'verificacion CA-6'
    )
    assert.equal(fila.competencyType, 'technical', 'el tipo no debe haber cambiado')
    assert.equal(fila.competencyName, nombreOriginal, 'el nombre no debe haber cambiado')
  })

  // ── CA-7 ──────────────────────────────────────────────────────────────────
  test('CA-7a: POST con datos válidos → 201 (no regresión)', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const res = await client
      .post('/api/competencies')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ competencyName: uniqueTestName('CA7-valida').slice(0, 255), competencyType: 'technical' })
    res.assertStatus(201)
    assert.equal(res.body().type, 'success')
  })

  test('CA-7b: sin permiso de alta + cuerpo inválido → PERM.DENIED y no 422', async ({
    client,
    assert,
  }) => {
    // Actor sin ninguna concesión sobre el módulo
    const sinPermiso = await createTenantActor('val-tipo-sin-perm')
    // No se llama a grantModulePermissions: el actor no tiene concesiones
    // pero sí pertenece a una BU activa con el módulo encendido
    try {
      const res = await client
        .post('/api/competencies')
        .loginAs(sinPermiso.user)
        .headers(businessUnitHeaders(sinPermiso))
        .json({ competencyName: '', competencyType: 'value' })
      // El gate responde antes que la validación: debe ser 403 PERM.DENIED, no 422
      res.assertStatus(403)
      assert.equal(res.body().key, 'PERM.DENIED')
      assert.notEqual(res.body().code, 'CMPT.VAL.001', 'no debe responder 422 sin permiso')
    } finally {
      await cleanupTenantActor(sinPermiso)
    }
  })
})
