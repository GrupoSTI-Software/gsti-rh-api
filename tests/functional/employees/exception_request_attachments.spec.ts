import { test } from '@japa/runner'
import ExceptionRequest from '#models/exception_request'
import ExceptionRequestAttachment from '#models/exception_request_attachment'
import ExceptionType from '#models/exception_type'
import SystemModule from '#models/system_module'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import {
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

/**
 * HU-6: adjuntos de una solicitud.
 *
 * Un adjunto es un archivo servido por la aplicación, así que lo que importa no
 * es solo que se guarde: es que nadie pueda pedir el de otra empresa ni colar
 * una ruta de bucket propia. La clave de almacenamiento no sale en ninguna
 * respuesta, y el id de un adjunto ajeno responde 404 sin pistas.
 */
test.group('HU-6 — adjuntos de solicitudes', (group) => {
  let employeesModule: SystemModule
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let fixtureA: SensitiveFixture | null = null
  let exceptionType: ExceptionType | null = null
  let jefatura: UserResponsibleEmployee | null = null
  let solicitud: ExceptionRequest | null = null
  let adjuntoDeA: ExceptionRequestAttachment | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actorA = await createActor('hu6-att-a')
    actorB = await createActor('hu6-att-b')
    await grantOnly(actorA.role.roleId, [])
    await grantOnly(actorB.role.roleId, [])
    fixtureA = await createSensitiveFixture(actorA.businessUnit.businessUnitId, 'hu6-att-a')
    exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .firstOrFail()

    jefatura = await UserResponsibleEmployee.create({
      userId: actorA.user.userId,
      employeeId: fixtureA.employee.employeeId,
      businessUnitId: actorA.businessUnit.businessUnitId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 1,
    })

    solicitud = await ExceptionRequest.create({
      employeeId: fixtureA.employee.employeeId,
      exceptionTypeId: exceptionType.exceptionTypeId,
      exceptionRequestStatus: 'pending',
      exceptionRequestDescription: 'Solicitud de prueba HU-6',
      exceptionRequestCheckInTime: null,
      exceptionRequestCheckOutTime: null,
      exceptionRequestPeriodInHours: 0,
      requestedDate: new Date(),
      exceptionRequestRhRead: 0,
      exceptionRequestGerencialRead: 0,
      userId: actorA.user.userId,
    })

    // El adjunto se siembra directo: la subida real exige S3, y lo que este
    // spec protege es el acceso, no el transporte del archivo.
    adjuntoDeA = await ExceptionRequestAttachment.create({
      exceptionRequestId: solicitud.exceptionRequestId,
      businessUnitId: actorA.businessUnit.businessUnitId,
      attachmentStorageKey: 'valanserh/files/exception-requests/qa/comprobante.pdf',
      attachmentOriginalName: 'comprobante.pdf',
      attachmentMime: 'application/pdf',
      attachmentSizeBytes: 2048,
      uploadedByUserId: actorA.user.userId,
    })
  })

  group.teardown(async () => {
    try {
      if (adjuntoDeA) {
        await ExceptionRequestAttachment.query()
          .where('exception_request_attachment_id', adjuntoDeA.exceptionRequestAttachmentId)
          .delete()
      }
      if (solicitud) {
        await ExceptionRequest.query()
          .where('exception_request_id', solicitud.exceptionRequestId)
          .delete()
      }
      if (jefatura) {
        await UserResponsibleEmployee.query()
          .where('user_responsible_employee_id', jefatura.userResponsibleEmployeeId)
          .delete()
      }
      await cleanupSensitiveFixture(fixtureA)
      await cleanupActor(actorA)
      await cleanupActor(actorB)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('el listado devuelve los adjuntos sin la clave de almacenamiento', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/exception-requests/${solicitud!.exceptionRequestId}/attachments`)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 200)

    const payload = JSON.stringify(response.body()?.data ?? {})

    assert.include(payload, 'comprobante.pdf')
    assert.notInclude(payload, 'attachmentStorageKey')
    assert.notInclude(payload, 'valanserh/files')
  })

  test('otra empresa no lista los adjuntos de la solicitud', async ({ client, assert }) => {
    const response = await client
      .get(`/api/exception-requests/${solicitud!.exceptionRequestId}/attachments`)
      .loginAs(actorB!.user)
      .header('X-Business-Unit-Id', actorB!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 404)
  })

  test('otra empresa no descarga el adjunto', async ({ client, assert }) => {
    const response = await client
      .get(
        `/api/exception-requests/${solicitud!.exceptionRequestId}/attachments/${adjuntoDeA!.exceptionRequestAttachmentId}`
      )
      .loginAs(actorB!.user)
      .header('X-Business-Unit-Id', actorB!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 404)
  })

  test('subir sin archivo responde 400 y no crea registro', async ({ client, assert }) => {
    const antes = await ExceptionRequestAttachment.query()
      .where('exception_request_id', solicitud!.exceptionRequestId)
      .count('* as total')

    const response = await client
      .post(`/api/exception-requests/${solicitud!.exceptionRequestId}/attachments`)
      .loginAs(actorA!.user)
      .header('X-Business-Unit-Id', actorA!.businessUnit.businessUnitPublicId)

    assert.equal(response.status(), 400)

    const despues = await ExceptionRequestAttachment.query()
      .where('exception_request_id', solicitud!.exceptionRequestId)
      .count('* as total')

    assert.equal(
      Number((despues[0] as unknown as { $extras: { total: number } }).$extras.total),
      Number((antes[0] as unknown as { $extras: { total: number } }).$extras.total)
    )
  })
})
