import { test } from '@japa/runner'
import type { Group } from '@japa/runner/core'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import {
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Registra en el grupo un usuario root propio y lo borra al terminar.
 *
 * Por qué: los grupos tomaban el primer usuario de la BD y, si no había root,
 * recaían en cualquiera. Con la exigencia de `assessment-templates` encendida y
 * un gate en cada ruta, ese usuario responde 403 si su rol no es root u owner,
 * y en una BD recién sembrada ni siquiera se sabe cuál es. Root pasa el gate
 * por bypass standard y el toggle de estatus por el atajo del controller. Los
 * permisos del gate se prueban en `assessment_templates_permission_gate.spec.ts`.
 */
function useRootActor(group: Group, label: string): () => User {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('root', label)
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
    actor = null
  })

  return () => required(actor, 'el actor root').user
}

/**
 * Tests funcionales — AssessmentTemplateController
 * Rutas: /api/assessment-templates
 *
 * Validaciones documentadas:
 *
 * POST / (store)
 *   - assessmentTemplateName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDescription: opcional, string, max 2000 chars
 *   - dimensions[].assessmentTemplateDimensionName: requerido, string, min 1, max 200
 *   - dimensions[].assessmentTemplateDimensionAcronym: requerido, string, min 1, max 20
 *
 * PUT /:assessmentTemplateId (update)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *   - assessmentTemplateName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDescription: opcional, string, max 2000 chars
 *   - dimensions[].assessmentTemplateDimensionId: opcional, número positivo (para actualizar existente)
 *   - dimensions[].assessmentTemplateDimensionName: requerido, string, min 1, max 200
 *   - dimensions[].assessmentTemplateDimensionAcronym: requerido, string, min 1, max 20
 *
 * DELETE /:assessmentTemplateId (delete)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre la plantilla y sus dimensiones activas
 *
 * GET /:assessmentTemplateId (show)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *
 * GET / (index)
 *   - search: opcional, string para filtrar por nombre
 *   - page: requerido, entero >= 1 (default 1)
 *   - limit: requerido, entero >= 1 (default 100)
 */

test.group('AssessmentTemplate - index GET /', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')

  group.setup(async () => {
    user = rootUser()
  })

  test('devuelve lista paginada de plantillas', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por término de búsqueda', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ search: 'psicometrica', page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 401 si no hay token de autenticación', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .qs({ page: 1, limit: 10 })

    response.assertStatus(401)
  })

  test('usa valores por defecto si page/limit son inválidos', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: -1, limit: 0 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })
})

test.group('AssessmentTemplate - store POST /', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  const createdIds: number[] = []

  group.setup(async () => {
    user = rootUser()
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db.from('assessment_template_dimensions')
        .whereIn(
          'assessment_template_id',
          db.from('assessment_templates')
            .whereIn('assessment_template_id', createdIds)
            .select('assessment_template_id')
        )
        .delete()
      await db.from('assessment_templates')
        .whereIn('assessment_template_id', createdIds)
        .delete()
    }
  })

  test('crea una plantilla sin dimensiones', async ({ client, assert }) => {
    const response = await client
      .post('/api/assessment-templates')
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Sin Dimensiones',
        assessmentTemplateDescription: 'Descripción de prueba',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const templateId = body.data?.assessmentTemplate?.assessmentTemplateId
    assert.exists(templateId)
    createdIds.push(templateId)
  })

  test('crea una plantilla con dimensiones', async ({ client, assert }) => {
    const response = await client
      .post('/api/assessment-templates')
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Con Dimensiones',
        dimensions: [
          {
            assessmentTemplateDimensionName: 'Dimensión Cognitiva',
            assessmentTemplateDimensionAcronym: 'COG',
          },
          {
            assessmentTemplateDimensionName: 'Dimensión Emocional',
            assessmentTemplateDimensionAcronym: 'EMO',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const template = body.data?.assessmentTemplate
    assert.exists(template?.assessmentTemplateId)
    assert.equal(template?.dimensions?.length, 2)
    createdIds.push(template.assessmentTemplateId)
  })

  test('falla con error de validación si falta el nombre', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateDescription: 'Sin nombre',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si el nombre supera 200 caracteres', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateName: 'A'.repeat(201),
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si el acrónimo de dimensión supera 20 caracteres', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateName: 'Plantilla Test Acrónim',
          dimensions: [
            {
              assessmentTemplateDimensionName: 'Dimensión Larga',
              assessmentTemplateDimensionAcronym: 'A'.repeat(21),
            },
          ],
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplate - show GET /:id', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  let template: AssessmentTemplate

  group.setup(async () => {
    user = rootUser()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Show',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve la plantilla por ID', async ({ client, assert }) => {
    const response = await client
      .get(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplate?.assessmentTemplateId,
      template.assessmentTemplateId
    )
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido (NaN)', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('AssessmentTemplate - update PUT /:id', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  let template: AssessmentTemplate

  group.setup(async () => {
    user = rootUser()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Update Original',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('actualiza el nombre de una plantilla', async ({ client, assert }) => {
    const response = await client
      .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Update Modificada',
        assessmentTemplateDescription: 'Descripción actualizada',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplate?.assessmentTemplateName,
      'Plantilla Test Update Modificada'
    )
  })

  test('sincroniza dimensiones al actualizar: agrega nuevas', async ({ client, assert }) => {
    const response = await client
      .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Update Con Dims',
        dimensions: [
          {
            assessmentTemplateDimensionName: 'Nueva Dimensión',
            assessmentTemplateDimensionAcronym: 'ND',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.isAtLeast(body.data?.assessmentTemplate?.dimensions?.length, 1)
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .put('/api/assessment-templates/999999999')
      .loginAs(user)
      .json({ assessmentTemplateName: 'No existe' })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .put('/api/assessment-templates/abc')
      .loginAs(user)
      .json({ assessmentTemplateName: 'Test' })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('falla si el nombre es vacío', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
        .loginAs(user)
        .json({ assessmentTemplateName: '' })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplate - delete DELETE /:id', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')

  group.setup(async () => {
    user = rootUser()
  })

  test('elimina (soft delete) una plantilla y sus dimensiones', async ({ client }) => {
    const template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Delete',
      assessmentTemplateDescription: null,
    })

    const response = await client
      .delete(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    // Verificar que ya no es visible por la API (soft deleted)
    const showResponse = await client
      .get(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    showResponse.assertStatus(404)

    // Limpieza: eliminar el registro soft-deleted
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-templates/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-templates/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

/**
 * CAP-02-08-01 — toggle-status y filtro de estatus.
 * Cubre los criterios de aceptación:
 *  - GET /api/assessment-templates?status=active|inactive|all aplica filtro.
 *  - PATCH /api/assessment-templates/:id/status conmuta `is_active` y
 *    responde 200 con `{ assessmentTemplateId, assessmentTemplateIsActive }`.
 *  - 404 cuando la plantilla no existe.
 *  - 403 con `key: 'sin-permiso'` cuando el rol no tiene el permiso
 *    `toggle-status` sobre el módulo `assessment-templates`.
 */
test.group('AssessmentTemplate - toggle-status PATCH /:id/status', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  let activeTemplate: AssessmentTemplate
  let inactiveTemplate: AssessmentTemplate

  group.setup(async () => {
    // El happy path requiere un usuario con rol 'root' (bypass del chequeo
    // de permisos en el controlador). El test de 403 más abajo usa un
    // usuario no-root.
    user = rootUser()
    activeTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Toggle Activa',
      assessmentTemplateDescription: null,
      assessmentTemplateIsActive: true,
    })
    inactiveTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Toggle Inactiva',
      assessmentTemplateDescription: null,
      assessmentTemplateIsActive: false,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_templates')
      .whereIn('assessment_template_id', [
        activeTemplate.assessmentTemplateId,
        inactiveTemplate.assessmentTemplateId,
      ])
      .delete()
  })

  test('desactiva una plantilla activa (isActive=false)', async ({ client, assert }) => {
    const response = await client
      .patch(`/api/assessment-templates/${activeTemplate.assessmentTemplateId}/status`)
      .loginAs(user)
      .json({ isActive: false })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplate?.assessmentTemplateId,
      activeTemplate.assessmentTemplateId
    )
    assert.equal(body.data?.assessmentTemplate?.assessmentTemplateIsActive, false)
  })

  test('reactiva una plantilla inactiva (isActive=true)', async ({ client, assert }) => {
    const response = await client
      .patch(`/api/assessment-templates/${inactiveTemplate.assessmentTemplateId}/status`)
      .loginAs(user)
      .json({ isActive: true })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data?.assessmentTemplate?.assessmentTemplateIsActive, true)
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .patch('/api/assessment-templates/999999999/status')
      .loginAs(user)
      .json({ isActive: false })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .patch('/api/assessment-templates/abc/status')
      .loginAs(user)
      .json({ isActive: false })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test("rol sin toggle-status recibe 403 con key 'sin-permiso' aunque tenga read y update", async ({
    client,
    assert,
  }) => {
    // Actor con rol propio y concesiones explícitas: antes se buscaba cualquier
    // usuario no root de la BD y, si no había, el caso se daba por bueno.
    const tenant = await createTenantActor('plantillas-toggle-sin')
    try {
      await grantModulePermissions(tenant, 'assessment-templates', ['read', 'update'])
      const template = await AssessmentTemplate.findOrFail(activeTemplate.assessmentTemplateId)
      template.assessmentTemplateIsActive = true
      await template.save()

      const response = await client
        .patch(`/api/assessment-templates/${activeTemplate.assessmentTemplateId}/status`)
        .loginAs(tenant.user)
        .json({ isActive: false })

      response.assertStatus(403)
      response.assertBodyContains({ key: 'sin-permiso' })
      const reloaded = await AssessmentTemplate.findOrFail(activeTemplate.assessmentTemplateId)
      assert.isTrue(Boolean(reloaded.assessmentTemplateIsActive))
    } finally {
      await cleanupTenantActor(tenant)
    }
  })

  test('rol con toggle-status conmuta el estatus sin ser root ni owner', async ({
    client,
    assert,
  }) => {
    const tenant = await createTenantActor('plantillas-toggle-con')
    try {
      await grantModulePermissions(tenant, 'assessment-templates', ['toggle-status'])
      const template = await AssessmentTemplate.findOrFail(activeTemplate.assessmentTemplateId)
      template.assessmentTemplateIsActive = true
      await template.save()

      const response = await client
        .patch(`/api/assessment-templates/${activeTemplate.assessmentTemplateId}/status`)
        .loginAs(tenant.user)
        .json({ isActive: false })

      response.assertStatus(200)
      assert.equal(response.body().data?.assessmentTemplate?.assessmentTemplateIsActive, false)
    } finally {
      await cleanupTenantActor(tenant)
    }
  })
})

/**
 * CAP-02-08-01 — Filtro de estatus en GET /api/assessment-templates.
 * Verifica que `?status=active` (default) excluye inactivas, `?status=inactive`
 * sólo muestra inactivas y `?status=all` devuelve ambas.
 */
test.group('AssessmentTemplate - index filtro ?status=', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  let activeTemplate: AssessmentTemplate
  let inactiveTemplate: AssessmentTemplate

  group.setup(async () => {
    user = rootUser()
    activeTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Filtro Activa',
      assessmentTemplateDescription: null,
      assessmentTemplateIsActive: true,
    })
    inactiveTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Filtro Inactiva',
      assessmentTemplateDescription: null,
      assessmentTemplateIsActive: false,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_templates')
      .whereIn('assessment_template_id', [
        activeTemplate.assessmentTemplateId,
        inactiveTemplate.assessmentTemplateId,
      ])
      .delete()
  })

  test('default (active) excluye inactivas', async ({ client, assert }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: 1, limit: 1000 })

    response.assertStatus(200)
    const items: any[] = response.body().data?.assessmentTemplates?.data ?? []
    const ids = items.map((i) => i.assessmentTemplateId)
    assert.include(ids, activeTemplate.assessmentTemplateId)
    assert.notInclude(ids, inactiveTemplate.assessmentTemplateId)
  })

  test('?status=inactive sólo devuelve inactivas', async ({ client, assert }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: 1, limit: 1000, status: 'inactive' })

    response.assertStatus(200)
    const items: any[] = response.body().data?.assessmentTemplates?.data ?? []
    const ids = items.map((i) => i.assessmentTemplateId)
    assert.notInclude(ids, activeTemplate.assessmentTemplateId)
    assert.include(ids, inactiveTemplate.assessmentTemplateId)
  })

  test('?status=all devuelve activas e inactivas', async ({ client, assert }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: 1, limit: 1000, status: 'all' })

    response.assertStatus(200)
    const items: any[] = response.body().data?.assessmentTemplates?.data ?? []
    const ids = items.map((i) => i.assessmentTemplateId)
    assert.include(ids, activeTemplate.assessmentTemplateId)
    assert.include(ids, inactiveTemplate.assessmentTemplateId)
  })
})

/**
 * CAP-02-08-XX — Reordenar dimensiones (PATCH /:id/dimensions/reorder).
 * Cubre los criterios de aceptación:
 *  - Reorden válido: el GET siguiente devuelve las dimensiones en el
 *    nuevo orden con `orderIndex` 0..N-1.
 *  - 422 `key: 'dimension-fuera-de-template'` cuando un dimensionId no
 *    pertenece a la plantilla.
 *  - 422 `key: 'indices-duplicados'` cuando hay orderIndex repetidos.
 */
test.group('AssessmentTemplate - reorder PATCH /:id/dimensions/reorder', (group) => {
  let user: User
  const rootUser = useRootActor(group, 'plantillas')
  let template: AssessmentTemplate
  let dimA: number
  let dimB: number
  let dimC: number
  let foreignTemplate: AssessmentTemplate
  let foreignDim: number

  group.setup(async () => {
    user = rootUser()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Reorder ABC',
      assessmentTemplateDescription: null,
    })
    // Usamos el modelo (no db.table().insert) para que Lucid setee
    // automáticamente `assessment_template_dimension_created_at/_updated_at`
    // gracias a los decoradores `autoCreate`/`autoUpdate`.
    const a = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'A',
      assessmentTemplateDimensionAcronym: 'A',
      assessmentTemplateDimensionDataType: 'numeric',
      assessmentTemplateDimensionOrderIndex: 0,
    })
    const b = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'B',
      assessmentTemplateDimensionAcronym: 'B',
      assessmentTemplateDimensionDataType: 'numeric',
      assessmentTemplateDimensionOrderIndex: 1,
    })
    const c = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'C',
      assessmentTemplateDimensionAcronym: 'C',
      assessmentTemplateDimensionDataType: 'numeric',
      assessmentTemplateDimensionOrderIndex: 2,
    })
    dimA = a.assessmentTemplateDimensionId
    dimB = b.assessmentTemplateDimensionId
    dimC = c.assessmentTemplateDimensionId

    foreignTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Foránea',
      assessmentTemplateDescription: null,
    })
    const f = await AssessmentTemplateDimension.create({
      assessmentTemplateId: foreignTemplate.assessmentTemplateId,
      assessmentTemplateDimensionName: 'X',
      assessmentTemplateDimensionAcronym: 'X',
      assessmentTemplateDimensionDataType: 'numeric',
      assessmentTemplateDimensionOrderIndex: 0,
    })
    foreignDim = f.assessmentTemplateDimensionId
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .whereIn('assessment_template_id', [
        template.assessmentTemplateId,
        foreignTemplate.assessmentTemplateId,
      ])
      .delete()
    await db
      .from('assessment_templates')
      .whereIn('assessment_template_id', [
        template.assessmentTemplateId,
        foreignTemplate.assessmentTemplateId,
      ])
      .delete()
  })

  test('reorden válido: C, A, B aplica orderIndex 0,1,2 y el GET respeta el nuevo orden', async ({
    client,
    assert,
  }) => {
    const reorderResponse = await client
      .patch(
        `/api/assessment-templates/${template.assessmentTemplateId}/dimensions/reorder`
      )
      .loginAs(user)
      .json({
        dimensions: [
          { dimensionId: dimC, orderIndex: 0 },
          { dimensionId: dimA, orderIndex: 1 },
          { dimensionId: dimB, orderIndex: 2 },
        ],
      })

    reorderResponse.assertStatus(200)
    reorderResponse.assertBodyContains({ type: 'success' })

    const showResponse = await client
      .get(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)
    showResponse.assertStatus(200)
    const dimensions = showResponse.body().data?.assessmentTemplate?.dimensions ?? []
    const ids = dimensions.map((d: any) => d.assessmentTemplateDimensionId)
    assert.deepEqual(ids, [dimC, dimA, dimB])
    assert.equal(dimensions[0].assessmentTemplateDimensionOrderIndex, 0)
    assert.equal(dimensions[1].assessmentTemplateDimensionOrderIndex, 1)
    assert.equal(dimensions[2].assessmentTemplateDimensionOrderIndex, 2)
  })

  test("dimension fuera del template responde 422 con key 'dimension-fuera-de-template'", async ({
    client,
  }) => {
    const response = await client
      .patch(
        `/api/assessment-templates/${template.assessmentTemplateId}/dimensions/reorder`
      )
      .loginAs(user)
      .json({
        dimensions: [
          { dimensionId: dimA, orderIndex: 0 },
          { dimensionId: foreignDim, orderIndex: 1 },
        ],
      })

    response.assertStatus(422)
    response.assertBodyContains({ key: 'dimension-fuera-de-template' })
  })

  test("indices duplicados responden 422 con key 'indices-duplicados'", async ({
    client,
  }) => {
    const response = await client
      .patch(
        `/api/assessment-templates/${template.assessmentTemplateId}/dimensions/reorder`
      )
      .loginAs(user)
      .json({
        dimensions: [
          { dimensionId: dimA, orderIndex: 0 },
          { dimensionId: dimB, orderIndex: 0 },
        ],
      })

    response.assertStatus(422)
    response.assertBodyContains({ key: 'indices-duplicados' })
  })

  test('responde 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .patch('/api/assessment-templates/999999999/dimensions/reorder')
      .loginAs(user)
      .json({
        dimensions: [{ dimensionId: dimA, orderIndex: 0 }],
      })
    response.assertStatus(404)
  })
})
