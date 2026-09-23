import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import {
  asignacionFromBody,
  asignacionesFromBody,
  asRecord,
  buHeader,
  buildContratoCreatePayload,
  cleanupRepseSensitiveMaskActors,
  cleanupRepseSensitiveMaskFixture,
  contratoFromBody,
  contratoFromListBody,
  contratoFromVersionBody,
  contratanteFromContrato,
  CONTRATOS_BASE,
  createRepseSensitiveMaskActors,
  createRepseSensitiveMaskFixture,
  empleadoFromAsignacion,
  reloadContratanteRfc,
  reloadPersonNss,
  stripSensitiveContratoFields,
  type RepseSensitiveMaskActors,
  type RepseSensitiveMaskFixture,
} from './repse_contratos_asignaciones_sensitive_mask_support.js'
import { uniqueStamp } from '../helpers/contrato_import_excel_fixture.js'

test.group('REPSE contratos y asignaciones — máscara RFC/NSS USRH1789477675767', (group) => {
  let actors: RepseSensitiveMaskActors
  let fixture: RepseSensitiveMaskFixture

  group.setup(async () => {
    actors = await createRepseSensitiveMaskActors('repse-mask')
    fixture = await createRepseSensitiveMaskFixture(actors.sin.businessUnit, 'repse-mask')
  })

  group.teardown(async () => {
    await cleanupRepseSensitiveMaskFixture(fixture)
    await cleanupRepseSensitiveMaskActors(actors)
  })

  test('CA-1: sin identificación el RFC del contratante llega tapado en alta, listado, detalle y edición', async ({
    client,
    assert,
  }) => {
    const numeroAlta = `CSE-MASK-ALTA-${uniqueStamp()}`
    const createResponse = await client
      .post(CONTRATOS_BASE)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json(buildContratoCreatePayload(fixture, numeroAlta))

    createResponse.assertStatus(201)
    const created = contratoFromBody(createResponse.body())
    const contratanteAlta = contratanteFromContrato(created)
    assert.equal(contratanteAlta.rfc, SENSITIVE_MASK)
    assert.equal(contratanteAlta.razonSocial, fixture.contratante.razonSocial)

    const listResponse = await client
      .get(CONTRATOS_BASE)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .qs({ q: numeroAlta })

    listResponse.assertStatus(200)
    const listed = contratoFromListBody(listResponse.body())
    assert.equal(contratanteFromContrato(listed).rfc, SENSITIVE_MASK)
    assert.equal(contratanteFromContrato(listed).razonSocial, fixture.contratante.razonSocial)

    const contratoId = Number(created.id)
    const showResponse = await client
      .get(`${CONTRATOS_BASE}/${contratoId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))

    showResponse.assertStatus(200)
    const detail = contratoFromBody(showResponse.body())
    assert.equal(contratanteFromContrato(detail).rfc, SENSITIVE_MASK)

    const patchResponse = await client
      .patch(`${CONTRATOS_BASE}/${contratoId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({ objetoServicio: `${detail.objetoServicio} Actualizado en prueba.` })

    patchResponse.assertStatus(200)
    const updated = contratoFromBody(patchResponse.body())
    assert.equal(contratanteFromContrato(updated).rfc, SENSITIVE_MASK)
    assert.equal(contratanteFromContrato(updated).razonSocial, fixture.contratante.razonSocial)
  })

  test('CA-2: sin identificación el RFC del contratante llega tapado en renovación y addendum', async ({
    client,
    assert,
  }) => {
    const renewResponse = await client
      .post(`${CONTRATOS_BASE}/${fixture.contratoId}/renovaciones`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({
        fechaInicio: '2027-01-01',
        fechaFin: '2028-12-31',
        motivo: 'Renovación de prueba para máscara REPSE',
      })

    renewResponse.assertStatus(201)
    const renewed = contratoFromVersionBody(renewResponse.body())
    assert.equal(contratanteFromContrato(renewed).rfc, SENSITIVE_MASK)

    const addendumResponse = await client
      .post(`${CONTRATOS_BASE}/${fixture.contratoId}/addendums`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({
        motivo: 'Addendum de prueba para máscara REPSE',
        anexo: {
          numeroTrabajadoresAprox: 9,
        },
      })

    addendumResponse.assertStatus(201)

    const showAfterAddendum = await client
      .get(`${CONTRATOS_BASE}/${fixture.contratoId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))

    showAfterAddendum.assertStatus(200)
    const addended = contratoFromBody(showAfterAddendum.body())
    assert.equal(contratanteFromContrato(addended).rfc, SENSITIVE_MASK)
  })

  test('CA-4: sin identificación el NSS llega tapado o null y el resto del empleado intacto', async ({
    client,
    assert,
  }) => {
    const assignResponse = await client
      .post(`${CONTRATOS_BASE}/${fixture.contratoId}/asignaciones`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({
        asignaciones: [
          {
            employeeId: fixture.employeeConNss.employee.employeeId,
            fechaInicio: '2026-04-01',
            porcentajeTiempo: 40,
          },
          {
            employeeId: fixture.employeeSinNss.employee.employeeId,
            fechaInicio: '2026-04-01',
            porcentajeTiempo: 30,
          },
        ],
      })

    assignResponse.assertStatus(201)
    const createdRows = asRecord(assignResponse.body().data).asignaciones as unknown[]
    assert.isArray(createdRows)
    assert.lengthOf(createdRows, 2)

    const conNss = createdRows.find(
      (row) =>
        Number(empleadoFromAsignacion(asRecord(row)).id) === fixture.employeeConNss.employee.employeeId
    )
    const sinNss = createdRows.find(
      (row) =>
        Number(empleadoFromAsignacion(asRecord(row)).id) ===
        fixture.employeeSinNss.employee.employeeId
    )
    assert.exists(conNss)
    assert.exists(sinNss)
    assert.equal(empleadoFromAsignacion(asRecord(conNss!)).nss, SENSITIVE_MASK)
    assert.isNull(empleadoFromAsignacion(asRecord(sinNss!)).nss)
    assert.include(
      String(empleadoFromAsignacion(asRecord(conNss!)).nombre),
      fixture.employeeConNss.employee.employeeFirstName
    )

    const listResponse = await client
      .get(`${CONTRATOS_BASE}/${fixture.contratoId}/asignaciones`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))

    listResponse.assertStatus(200)
    const listed = asignacionesFromBody(listResponse.body())
    const listedConNss = listed.find(
      (row) =>
        Number(empleadoFromAsignacion(row).id) === fixture.employeeConNss.employee.employeeId
    )
    const listedSinNss = listed.find(
      (row) =>
        Number(empleadoFromAsignacion(row).id) === fixture.employeeSinNss.employee.employeeId
    )
    assert.equal(empleadoFromAsignacion(listedConNss!).nss, SENSITIVE_MASK)
    assert.isNull(empleadoFromAsignacion(listedSinNss!).nss)

    const asignacionId = Number(asRecord(listedConNss!).id)
    const patchResponse = await client
      .patch(`${CONTRATOS_BASE}/${fixture.contratoId}/asignaciones/${asignacionId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({ porcentajeTiempo: 45 })

    patchResponse.assertStatus(200)
    const patched = asignacionFromBody(patchResponse.body())
    assert.equal(empleadoFromAsignacion(patched).nss, SENSITIVE_MASK)
    assert.equal(
      Number(empleadoFromAsignacion(patched).id),
      fixture.employeeConNss.employee.employeeId
    )
  })

  test('CA-3: con identificación el RFC del contrato y el NSS de asignaciones siguen enmascarados en GET', async ({
    client,
    assert,
  }) => {
    const showResponse = await client
      .get(`${CONTRATOS_BASE}/${fixture.contratoId}`)
      .loginAs(actors.con.user)
      .header('X-Business-Unit-Id', buHeader(actors.con))

    showResponse.assertStatus(200)
    const detail = contratoFromBody(showResponse.body())
    assert.equal(contratanteFromContrato(detail).rfc, SENSITIVE_MASK)

    const listResponse = await client
      .get(`${CONTRATOS_BASE}/${fixture.contratoId}/asignaciones`)
      .loginAs(actors.con.user)
      .header('X-Business-Unit-Id', buHeader(actors.con))

    listResponse.assertStatus(200)
    const rows = asignacionesFromBody(listResponse.body())
    const row = rows.find(
      (item) => Number(empleadoFromAsignacion(item).id) === fixture.employeeConNss.employee.employeeId
    )
    assert.exists(row)
    assert.equal(empleadoFromAsignacion(row!).nss, SENSITIVE_MASK)
  })

  test('CA-5: editar, renovar y asignar no cambia el RFC ni el NSS guardados', async ({
    client,
    assert,
  }) => {
    const rfcOriginal = await reloadContratanteRfc(fixture.contratante.empresaContratanteId)
    const nssOriginal = await reloadPersonNss(fixture.employeeConNss.person.personId)

    const patchResponse = await client
      .patch(`${CONTRATOS_BASE}/${fixture.contratoId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({ fechaFin: '2028-06-30' })

    patchResponse.assertStatus(200)

    const renewResponse = await client
      .post(`${CONTRATOS_BASE}/${fixture.contratoId}/renovaciones`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))
      .json({
        fechaInicio: '2028-07-01',
        fechaFin: '2029-12-31',
        motivo: 'Renovación CA-5 integridad del dato',
      })

    renewResponse.assertStatus(201)

    assert.equal(await reloadContratanteRfc(fixture.contratante.empresaContratanteId), rfcOriginal)
    assert.equal(await reloadPersonNss(fixture.employeeConNss.person.personId), nssOriginal)
  })

  test('CA-6: el resto del contrato sin RFC ni NSS coincide con la forma esperada', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`${CONTRATOS_BASE}/${fixture.contratoId}`)
      .loginAs(actors.sin.user)
      .header('X-Business-Unit-Id', buHeader(actors.sin))

    response.assertStatus(200)
    const detail = contratoFromBody(response.body())
    const stripped = stripSensitiveContratoFields(detail)

    assert.equal(stripped.id, fixture.contratoId)
    assert.equal(stripped.numeroContrato, fixture.contratoNumero)
    assert.equal(contratanteFromContrato(stripped).id, fixture.contratante.empresaContratanteId)
    assert.equal(
      contratanteFromContrato(stripped).razonSocial,
      fixture.contratante.razonSocial
    )
    assert.equal(stripped.moneda, 'MXN')
    assert.isObject(stripped.anexo15d)
  })

  test('CA-8: los DTO REPSE no alimentan documentos ni rutas laterales con la máscara', async ({
    assert,
  }) => {
    const repoRoot = process.cwd()
    const contratoSource = readFileSync(
      join(repoRoot, 'app/services/contrato_servicio_especializado_service.ts'),
      'utf-8'
    )
    const asignacionSource = readFileSync(
      join(repoRoot, 'app/services/asignacion_contrato_especializado_service.ts'),
      'utf-8'
    )
    const documentoSource = readFileSync(
      join(repoRoot, 'app/services/documento_contrato_especializado_service.ts'),
      'utf-8'
    )

    assert.include(contratoSource, 'function serializeContratanteBasico')
    assert.notInclude(documentoSource, 'serializeContratanteBasico')
    assert.notInclude(documentoSource, 'serializeEmpleado')
    assert.notInclude(documentoSource, SENSITIVE_MASK)

    assert.notInclude(documentoSource, 'serializeEmpleado')
    assert.notInclude(contratoSource, 'serializeEmpleado')
    assert.include(asignacionSource, 'function serializeEmpleado')
    assert.notInclude(asignacionSource, 'export function serializeEmpleado')
  })
})
