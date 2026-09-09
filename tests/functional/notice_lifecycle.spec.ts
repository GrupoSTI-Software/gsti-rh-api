import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Department from '#models/department'
import Notice from '#models/notice'
import NoticeFile from '#models/notice_file'
import NoticeRecipient from '#models/notice_recipient'
import RoleSystemPermission from '#models/role_system_permission'
import UploadService from '#services/upload_service'
import { NOTICE_FILE_FOLDER } from '#constants/notice'
import {
  grantFullEmployeeAccess,
  grantNoticePermissions,
  revokeNoticePermissions,
  setNoticeModuleEnforcement,
} from './helpers/notice_permissions.js'

/**
 * Ciclo de vida del aviso (Avisos y noticias v2, segunda entrega).
 *
 * - Para el colaborador solo existe lo ENVIADO: un borrador o un programado no
 *   se lista, no se abre y no cuenta como pendiente aunque ya tenga su fila de
 *   destinatario. El detalle trae solo su fila (bandera de lectura), nunca la
 *   lista de destinatarios. Los binarios (`body-file`, `files/:id/content`)
 *   ramifican por la presencia de `employeeId`, igual que `index` y `show`.
 * - Un borrador solo exige asunto. Sobre un aviso ya enviado solo caben
 *   `update` (guardar sin reenviar) y `now`; `draft` y `scheduled` responden
 *   400 `aviso-ya-enviado`. `send` sobre un borrador que nunca salió exige el
 *   aviso completo.
 * - `syncRecipients` conserva las filas con historial (ya se les envió o ya lo
 *   abrieron) aunque el criterio nuevo las deje fuera, marcadas fuera del
 *   público (`noticeRecipientInAudience`): un reenvío no las alcanza.
 * - `company` y `department` resuelven sus destinatarios en el servidor, con
 *   el alcance del rol de quien redacta (la regla del listado de empleados).
 * - `mark-as-read` es idempotente.
 * - La rama de administración exige el permiso `read` del módulo.
 * - Borrar da de baja las filas antes de tocar el almacenamiento.
 *
 * Las pruebas escriben sobre la base de desarrollo y limpian lo suyo; las que
 * pasan por `POST /api/notices` requieren las migraciones `1788800000010` y
 * `1788800000011`, y la de binarios necesita el bucket de desarrollo.
 */

const TEST_PASSWORD = 'NoticeLifecycleTest123!'

/** PNG de 1x1 para poblar el bucket de desarrollo en la prueba de binarios. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

interface Actor {
  user: User
  person: Person
  employee: Employee
  businessUnit: BusinessUnit
  role: Role
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

/** Un colaborador con usuario. Si se pasa una empresa, se une a ella. */
async function createActor(prefix: string, sharedUnit?: BusinessUnit): Promise<Actor> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const businessUnit =
    sharedUnit ??
    (await BusinessUnit.create({
      businessUnitName: `Ciclo avisos ${prefix} ${stamp}`,
      businessUnitSlug: `ciclo-avisos-${prefix}-${stamp}`,
      businessUnitLegalName: `Ciclo avisos ${prefix} Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    }))
  const role = await Role.create({
    roleName: `Ciclo avisos ${prefix} ${stamp}`,
    roleSlug: `ciclo-avisos-${prefix}-${stamp}`,
    roleDescription: 'Rol temporal para el ciclo de vida de avisos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Ciclo',
    personLastname: 'Avisos',
    personSecondLastname: prefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `CICLO-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `CICLO-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTerminatedDate = null
  await employee.save()

  return { user, person, employee, businessUnit, role }
}

async function cleanupActor(actor: Actor | null, ownsUnit: boolean) {
  if (!actor) return
  await NoticeRecipient.query().where('employee_id', actor.employee.employeeId).delete()
  await Employee.query().where('employee_id', actor.employee.employeeId).delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  if (ownsUnit) {
    await BusinessUnit.query()
      .where('business_unit_id', actor.businessUnit.businessUnitId)
      .delete()
  }
}

interface NoticeSeed {
  subject: string
  sentAt?: DateTime | null
  scheduledAt?: DateTime | null
}

/** Un aviso de texto en la empresa dada, en el estado que pida la semilla. */
async function createNotice(businessUnit: BusinessUnit, seed: NoticeSeed): Promise<Notice> {
  return Notice.create({
    businessUnitId: businessUnit.businessUnitId,
    noticeSubject: seed.subject,
    noticeDescription: '<p>Cuerpo de prueba</p>',
    noticeType: 'text',
    noticeAudience: 'manual',
    noticeSentAt: seed.sentAt ?? null,
    noticeScheduledAt: seed.scheduledAt ?? null,
  })
}

/** Fila de destinatario; `delivered` la marca como ya enviada (historial). */
async function addRecipient(notice: Notice, actor: Actor, delivered: boolean): Promise<void> {
  const recipient = new NoticeRecipient()
  recipient.noticeId = notice.noticeId
  recipient.employeeId = actor.employee.employeeId
  recipient.businessUnitId = notice.businessUnitId
  recipient.employeeEmail = actor.person.personEmail!
  recipient.employeeName = actor.person.personFirstname
  recipient.noticeRecipientSent = delivered
  recipient.noticeRecipientSentAt = delivered ? DateTime.now() : null
  recipient.noticeRecipientRead = false
  await recipient.save()
}

/** Departamento de la empresa dada, con código y nombre únicos. */
async function createDepartment(businessUnit: BusinessUnit, label: string): Promise<Department> {
  const stamp = uniqueStamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `AV-${stamp}`.slice(0, 50),
    departmentName: `Avisos ${label} ${stamp}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: businessUnit.businessUnitId,
    companyId: 1,
  })
}

async function assignDepartment(actor: Actor, departmentId: number | null): Promise<void> {
  actor.employee.departmentId = departmentId
  await actor.employee.save()
}

/** Borrado físico, incluidas las filas ya dadas de baja lógica. */
async function deleteNotices(noticeIds: number[]): Promise<void> {
  if (noticeIds.length === 0) return
  await NoticeRecipient.query().withTrashed().whereIn('notice_id', noticeIds).delete()
  await NoticeFile.query().withTrashed().whereIn('notice_id', noticeIds).delete()
  await Notice.query().withTrashed().whereIn('notice_id', noticeIds).delete()
}

function unidadDe(actor: Actor): string {
  return actor.businessUnit.businessUnitPublicId
}

test.group('Avisos — ciclo de vida (v2, segunda entrega)', (group) => {
  let ana: Actor | null = null
  let admin: Actor | null = null
  let sharedDepartment: Department | null = null
  let draft: Notice | null = null
  let scheduled: Notice | null = null
  let sent: Notice | null = null
  let grants: RoleSystemPermission[] = []
  const createdViaApi: number[] = []

  group.setup(async () => {
    ana = await createActor('ana')
    admin = await createActor('admin', ana.businessUnit)
    grants = [
      ...(await grantNoticePermissions(admin.role.roleId, ['read', 'create', 'update', 'delete'])),
      // Con acceso completo a la plantilla el público `company` alcanza a toda
      // la empresa; sin él se recorta a los colaboradores a cargo del usuario.
      ...(await grantFullEmployeeAccess(admin.role.roleId)),
    ]
    // El listado de empleados —y con él `company`— solo alcanza a quien tiene
    // departamento: los dos actores lo necesitan para contar como público.
    sharedDepartment = await createDepartment(ana.businessUnit, 'Compartido')
    await assignDepartment(ana, sharedDepartment.departmentId)
    await assignDepartment(admin, sharedDepartment.departmentId)

    draft = await createNotice(ana.businessUnit, { subject: 'Aviso borrador' })
    scheduled = await createNotice(ana.businessUnit, {
      subject: 'Aviso programado',
      scheduledAt: DateTime.now().plus({ days: 1 }),
    })
    sent = await createNotice(ana.businessUnit, {
      subject: 'Aviso enviado',
      sentAt: DateTime.now().minus({ hours: 1 }),
    })
    await addRecipient(draft, ana, false)
    await addRecipient(scheduled, ana, false)
    await addRecipient(sent, ana, true)
    // Segundo destinatario con historial: el detalle del colaborador no debe
    // listarlo y la edición no debe borrarlo.
    await addRecipient(sent, admin, true)
  })

  group.teardown(async () => {
    await deleteNotices(
      [draft, scheduled, sent]
        .filter((notice): notice is Notice => notice !== null)
        .map((notice) => notice.noticeId)
        .concat(createdViaApi)
    )
    await revokeNoticePermissions(grants)
    await cleanupActor(admin, false)
    // La empresa se borra al final: el departamento compartido cuelga de ella
    // y los colaboradores, del departamento.
    await cleanupActor(ana, false)
    if (sharedDepartment) {
      await Department.query().where('department_id', sharedDepartment.departmentId).delete()
    }
    if (ana) {
      await BusinessUnit.query()
        .where('business_unit_id', ana.businessUnit.businessUnitId)
        .delete()
    }
  })

  test('para el colaborador solo existe lo enviado: borrador y programado no se listan', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/notices')
      .qs({ employeeId: ana!.employee.employeeId })
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)

    response.assertStatus(200)
    const cuerpo = JSON.stringify(response.body())
    assert.include(cuerpo, 'Aviso enviado')
    assert.notInclude(cuerpo, 'Aviso borrador')
    assert.notInclude(cuerpo, 'Aviso programado')
  })

  test('el detalle de un borrador o un programado responde 404 al colaborador', async ({
    client,
    assert,
  }) => {
    for (const notice of [draft!, scheduled!]) {
      const response = await client
        .get(`/api/notices/${notice.noticeId}`)
        .qs({ employeeId: ana!.employee.employeeId })
        .header('X-Business-Unit-Id', unidadDe(ana!))
        .loginAs(ana!.user)
      assert.equal(response.status(), 404)
    }
  })

  test('la cuenta de no leídos solo cuenta lo enviado', async ({ client, assert }) => {
    const response = await client
      .get('/api/notices/unread-count')
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)

    response.assertStatus(200)
    // Tres filas de destinatario, una sola enviada.
    assert.equal(response.body().data.unreadCount, 1)
  })

  test('el detalle del colaborador trae solo su fila, nunca la lista de destinatarios', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/notices/${sent!.noticeId}`)
      .qs({ employeeId: ana!.employee.employeeId })
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)

    response.assertStatus(200)
    const notice = response.body().data.notice
    assert.isNotNull(notice.noticeSentAt)
    assert.lengthOf(notice.recipients, 1)
    assert.equal(notice.recipients[0].employeeId, ana!.employee.employeeId)
  })

  test('mark-as-read es idempotente: la primera apertura fija la fecha y las demás no la mueven', async ({
    client,
    assert,
  }) => {
    const primera = await client
      .post(`/api/notices/${sent!.noticeId}/mark-as-read`)
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)
    primera.assertStatus(200)

    // Se fija una fecha reconocible para detectar cualquier reescritura.
    const marca = DateTime.fromISO('2026-01-15T10:30:00', { zone: 'utc' })
    await NoticeRecipient.query()
      .where('notice_id', sent!.noticeId)
      .where('employee_id', ana!.employee.employeeId)
      .update({ notice_recipient_read_at: marca.toFormat('yyyy-LL-dd HH:mm:ss') })

    const segunda = await client
      .post(`/api/notices/${sent!.noticeId}/mark-as-read`)
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)
    segunda.assertStatus(200)

    const fila = await NoticeRecipient.query()
      .where('notice_id', sent!.noticeId)
      .where('employee_id', ana!.employee.employeeId)
      .firstOrFail()
    assert.isTrue(Boolean(fila.noticeRecipientRead))
    assert.equal(fila.noticeRecipientReadAt!.toUTC().toISO(), marca.toISO())
  })

  test('mark-as-read sobre un borrador responde 404: no existe para la app', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/notices/${draft!.noticeId}/mark-as-read`)
      .header('X-Business-Unit-Id', unidadDe(ana!))
      .loginAs(ana!.user)

    assert.equal(response.status(), 404)
  })

  test('un borrador solo exige asunto: sin mensaje ni destinatarios responde 201', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/notices')
      .json({ noticeSubject: 'Borrador solo con asunto', noticeSendMode: 'draft' })
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)

    response.assertStatus(201)
    const notice = response.body().data.notice
    createdViaApi.push(notice.noticeId)
    assert.equal(notice.noticeStatus, 'draft')
    assert.equal(response.body().data.dispatched, 0)
  })

  test('enviar ahora sigue exigiendo destinatarios', async ({ client, assert }) => {
    const response = await client
      .post('/api/notices')
      .json({
        noticeSubject: 'Sin destinatarios',
        noticeDescription: '<p>Mensaje</p>',
        noticeAudience: 'manual',
        noticeSendMode: 'now',
      })
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)

    assert.equal(response.status(), 400)
    assert.equal(response.body().key, 'aviso-destinatarios-requeridos')
  })

  test('draft y scheduled sobre un aviso enviado responden 400 aviso-ya-enviado', async ({
    client,
    assert,
  }) => {
    for (const noticeSendMode of ['draft', 'scheduled']) {
      const response = await client
        .put(`/api/notices/${sent!.noticeId}`)
        .json({
          noticeSubject: 'Aviso enviado',
          noticeDescription: '<p>Cuerpo</p>',
          noticeAudience: 'manual',
          noticeSendMode,
          noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
          recipientEmployeeIds: [ana!.employee.employeeId],
        })
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)

      assert.equal(response.status(), 400, `modo ${noticeSendMode}`)
      assert.equal(response.body().key, 'aviso-ya-enviado', `modo ${noticeSendMode}`)
    }
  })

  test('update sobre un enviado guarda sin reenviar y conserva el historial de destinatarios', async ({
    client,
    assert,
  }) => {
    const antes = await Notice.query().where('notice_id', sent!.noticeId).firstOrFail()

    // Solo Ana en la lista nueva: la fila del admin ya recibió el aviso y debe
    // conservarse como historial.
    const response = await client
      .put(`/api/notices/${sent!.noticeId}`)
      .json({
        noticeSubject: 'Aviso enviado (editado)',
        noticeDescription: '<p>Cuerpo editado</p>',
        noticeAudience: 'manual',
        noticeSendMode: 'update',
        recipientEmployeeIds: [ana!.employee.employeeId],
      })
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)

    response.assertStatus(201)
    const notice = response.body().data.notice
    assert.equal(response.body().data.dispatched, 0)
    assert.equal(notice.noticeSubject, 'Aviso enviado (editado)')
    assert.equal(notice.noticeStatus, 'sent')
    assert.equal(
      DateTime.fromISO(notice.noticeSentAt).toUTC().toISO(),
      antes.noticeSentAt!.toUTC().toISO()
    )
    assert.isNull(notice.noticeLastResentAt)

    const filas = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', sent!.noticeId)
    assert.lengthOf(filas, 2)
  })

  test('scheduled con público company resuelve los destinatarios en el servidor', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/notices')
      .json({
        noticeSubject: 'Toda la empresa',
        noticeDescription: '<p>Mensaje</p>',
        noticeAudience: 'company',
        noticeSendMode: 'scheduled',
        noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
      })
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)

    response.assertStatus(201)
    const notice = response.body().data.notice
    createdViaApi.push(notice.noticeId)
    assert.equal(notice.noticeStatus, 'scheduled')
    const ids = (notice.recipients as Array<{ employeeId: number }>).map((r) => r.employeeId)
    assert.include(ids, ana!.employee.employeeId)
    assert.include(ids, admin!.employee.employeeId)
  })

  test('scheduled con público department usa departmentId y lo persiste', async ({
    client,
    assert,
  }) => {
    const department = await createDepartment(ana!.businessUnit, 'Solo Ana')
    try {
      await assignDepartment(ana!, department.departmentId)

      const response = await client
        .post('/api/notices')
        .json({
          noticeSubject: 'Solo el departamento',
          noticeDescription: '<p>Mensaje</p>',
          noticeAudience: 'department',
          departmentId: department.departmentId,
          noticeSendMode: 'scheduled',
          noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
        })
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)

      response.assertStatus(201)
      const notice = response.body().data.notice
      createdViaApi.push(notice.noticeId)
      assert.equal(notice.noticeDepartmentId, department.departmentId)
      assert.isNull(notice.noticePositionId)
      const ids = (notice.recipients as Array<{ employeeId: number }>).map((r) => r.employeeId)
      assert.deepEqual(ids, [ana!.employee.employeeId])

      // Duplicar copia el criterio y nace en borrador.
      const copia = await client
        .post(`/api/notices/${notice.noticeId}/duplicate`)
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      copia.assertStatus(201)
      const duplicado = copia.body().data.notice
      createdViaApi.push(duplicado.noticeId)
      assert.equal(duplicado.noticeStatus, 'draft')
      assert.equal(duplicado.noticeDepartmentId, department.departmentId)
      assert.equal(duplicado.noticeAudience, 'department')
    } finally {
      await assignDepartment(ana!, sharedDepartment!.departmentId)
      await Department.query().where('department_id', department.departmentId).delete()
    }
  })

  test('send sobre un borrador que nunca salió exige el aviso completo y no fija noticeSentAt', async ({
    client,
    assert,
  }) => {
    const alta = await client
      .post('/api/notices')
      .json({
        noticeSubject: 'Borrador vacío a toda la empresa',
        noticeAudience: 'company',
        noticeSendMode: 'draft',
      })
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)
    alta.assertStatus(201)
    const noticeId: number = alta.body().data.notice.noticeId
    createdViaApi.push(noticeId)
    // El público `company` ya se resolvió al guardar: el borrador tiene filas
    // de destinatario aunque no tenga mensaje.
    assert.isAbove(alta.body().data.notice.recipients.length, 0)

    const envio = await client
      .post(`/api/notices/${noticeId}/send`)
      .json({})
      .header('X-Business-Unit-Id', unidadDe(admin!))
      .loginAs(admin!.user)
    assert.equal(envio.status(), 400)
    assert.equal(envio.body().key, 'aviso-mensaje-requerido')

    const fila = await Notice.query().where('notice_id', noticeId).firstOrFail()
    assert.isNull(fila.noticeSentAt)
  })

  test('los binarios ramifican por employeeId como index/show: sin él el admin previsualiza un borrador; con él, el borrador no existe', async ({
    client,
    assert,
  }) => {
    const uploadService = new UploadService()
    const key = await uploadService.uploadPrivateBuffer(
      `${NOTICE_FILE_FOLDER}/ciclo-avisos-${uniqueStamp()}.png`,
      PNG_1X1,
      'image/png'
    )
    if (!key) throw new Error('El bucket de desarrollo no aceptó la subida de prueba')

    const imageDraft = await Notice.create({
      businessUnitId: ana!.businessUnit.businessUnitId,
      noticeSubject: 'Borrador con imagen',
      noticeDescription: key,
      noticeType: 'image',
      noticeAudience: 'manual',
    })
    await addRecipient(imageDraft, ana!, false)
    const attachment = await NoticeFile.create({
      noticeId: imageDraft.noticeId,
      noticeFilePath: key,
    })
    try {
      // El admin tiene fila en `employees` (RH suele tenerla) y aun así, sin
      // employeeId, es la vista de administración: previsualiza el borrador.
      const cuerpoAdmin = await client
        .get(`/api/notices/${imageDraft.noticeId}/body-file`)
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      assert.equal(cuerpoAdmin.status(), 200)
      const adjuntoAdmin = await client
        .get(`/api/notices/${imageDraft.noticeId}/files/${attachment.noticeFileId}/content`)
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      assert.equal(adjuntoAdmin.status(), 200)

      // Con employeeId es la vista del colaborador: un borrador no existe.
      const cuerpoApp = await client
        .get(`/api/notices/${imageDraft.noticeId}/body-file`)
        .qs({ employeeId: ana!.employee.employeeId })
        .header('X-Business-Unit-Id', unidadDe(ana!))
        .loginAs(ana!.user)
      assert.equal(cuerpoApp.status(), 404)
      const adjuntoApp = await client
        .get(`/api/notices/${imageDraft.noticeId}/files/${attachment.noticeFileId}/content`)
        .qs({ employeeId: ana!.employee.employeeId })
        .header('X-Business-Unit-Id', unidadDe(ana!))
        .loginAs(ana!.user)
      assert.equal(adjuntoApp.status(), 404)
    } finally {
      await deleteNotices([imageDraft.noticeId])
      await uploadService.deleteFile(key)
    }
  })

  test('reenviar tras acotar el público solo despacha a las filas vigentes y conserva el historial', async ({
    client,
    assert,
  }) => {
    const soloAna = await createDepartment(ana!.businessUnit, 'Solo Ana')
    const aviso = await createNotice(ana!.businessUnit, {
      subject: 'Enviado a toda la empresa',
      sentAt: DateTime.now().minus({ hours: 2 }),
    })
    await addRecipient(aviso, ana!, true)
    await addRecipient(aviso, admin!, true)
    try {
      await assignDepartment(ana!, soloAna.departmentId)
      const response = await client
        .put(`/api/notices/${aviso.noticeId}`)
        .json({
          noticeSubject: 'Enviado (acotado a un departamento)',
          noticeDescription: '<p>Cuerpo</p>',
          noticeAudience: 'department',
          departmentId: soloAna.departmentId,
          noticeSendMode: 'now',
        })
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      response.assertStatus(201)

      // Solo Ana sigue en el público: el admin conserva su fila (ya lo recibió)
      // pero el reenvío no lo alcanza, y el conteo que confirma el BO tampoco.
      assert.equal(response.body().data.dispatched, 1)
      const notice = response.body().data.notice
      assert.isNotNull(notice.noticeLastResentAt)
      assert.equal(notice.noticeRecipientsCount, 1)
      assert.lengthOf(notice.recipients, 2)

      const filas = await NoticeRecipient.query()
        .whereNull('notice_recipient_deleted_at')
        .where('notice_id', aviso.noticeId)
      assert.lengthOf(filas, 2)
      const deAna = filas.find((fila) => fila.employeeId === ana!.employee.employeeId)
      const deAdmin = filas.find((fila) => fila.employeeId === admin!.employee.employeeId)
      assert.isDefined(deAna)
      assert.isDefined(deAdmin)
      assert.isTrue(Boolean(deAna!.noticeRecipientInAudience))
      assert.isFalse(Boolean(deAdmin!.noticeRecipientInAudience))
    } finally {
      await assignDepartment(ana!, sharedDepartment!.departmentId)
      await deleteNotices([aviso.noticeId])
      await Department.query().where('department_id', soloAna.departmentId).delete()
    }
  })

  test('un rol sin acceso completo: company se recorta a los colaboradores a cargo y un departamento fuera de alcance responde 400', async ({
    client,
    assert,
  }) => {
    const lead = await createActor('lead', ana!.businessUnit)
    const leadGrants = await grantNoticePermissions(lead.role.roleId, ['create'])
    const ajeno = await createDepartment(ana!.businessUnit, 'Ajeno')
    try {
      // Sin `full-employee-assigned` el listado de empleados —y `company`— solo
      // alcanza a quien el usuario tiene a cargo y a sí mismo.
      const recortado = await client
        .post('/api/notices')
        .json({
          noticeSubject: 'Recortado al alcance del rol',
          noticeDescription: '<p>Mensaje</p>',
          noticeAudience: 'company',
          noticeSendMode: 'scheduled',
          noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
        })
        .header('X-Business-Unit-Id', unidadDe(lead))
        .loginAs(lead.user)
      recortado.assertStatus(201)
      const notice = recortado.body().data.notice
      createdViaApi.push(notice.noticeId)
      const ids = (notice.recipients as Array<{ employeeId: number }>).map((r) => r.employeeId)
      assert.deepEqual(ids, [lead.employee.employeeId])

      const fuera = await client
        .post('/api/notices')
        .json({
          noticeSubject: 'Departamento ajeno',
          noticeAudience: 'department',
          departmentId: ajeno.departmentId,
          noticeSendMode: 'draft',
        })
        .header('X-Business-Unit-Id', unidadDe(lead))
        .loginAs(lead.user)
      assert.equal(fuera.status(), 400)
      assert.equal(fuera.body().key, 'departamento-fuera-de-alcance')
    } finally {
      await revokeNoticePermissions(leadGrants)
      await Department.query().where('department_id', ajeno.departmentId).delete()
      await cleanupActor(lead, false)
    }
  })

  test('delete: da de baja destinatarios, adjuntos y aviso, y solo después borra los objetos', async ({
    client,
    assert,
  }) => {
    const aviso = await createNotice(ana!.businessUnit, { subject: 'Aviso para borrar' })
    await addRecipient(aviso, ana!, false)
    // La key no existe en el bucket: el borrado del objeto se tolera y no
    // detiene la baja de las filas.
    const attachment = await NoticeFile.create({
      noticeId: aviso.noticeId,
      noticeFilePath: `${NOTICE_FILE_FOLDER}/inexistente-${uniqueStamp()}.pdf`,
    })
    try {
      const response = await client
        .delete(`/api/notices/${aviso.noticeId}`)
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      response.assertStatus(201)

      const notice = await Notice.query()
        .withTrashed()
        .where('notice_id', aviso.noticeId)
        .firstOrFail()
      assert.isNotNull(notice.deletedAt)
      const file = await NoticeFile.query()
        .withTrashed()
        .where('notice_file_id', attachment.noticeFileId)
        .firstOrFail()
      assert.isNotNull(file.deletedAt)
      const filas = await NoticeRecipient.query().where('notice_id', aviso.noticeId)
      assert.lengthOf(filas, 0)
    } finally {
      await deleteNotices([aviso.noticeId])
    }
  })

  test('sin permiso de lectura, la vista de administración responde 403 cuando el módulo exige permisos', async ({
    client,
    assert,
  }) => {
    const previous = await setNoticeModuleEnforcement(true)
    const plain = await createActor('plain', ana!.businessUnit)
    try {
      const listado = await client
        .get('/api/notices')
        .header('X-Business-Unit-Id', unidadDe(plain))
        .loginAs(plain.user)
      assert.equal(listado.status(), 403)
      assert.equal(listado.body().key, 'PERM.DENIED')

      const detalle = await client
        .get(`/api/notices/${sent!.noticeId}`)
        .header('X-Business-Unit-Id', unidadDe(plain))
        .loginAs(plain.user)
      assert.equal(detalle.status(), 403)

      // La escritura la corta el gate del router.
      const alta = await client
        .post('/api/notices')
        .json({ noticeSubject: 'Sin permiso', noticeSendMode: 'draft' })
        .header('X-Business-Unit-Id', unidadDe(plain))
        .loginAs(plain.user)
      assert.equal(alta.status(), 403)

      // La vista del colaborador no depende del permiso: sigue viendo lo suyo.
      const propio = await client
        .get('/api/notices')
        .qs({ employeeId: ana!.employee.employeeId })
        .header('X-Business-Unit-Id', unidadDe(ana!))
        .loginAs(ana!.user)
      assert.equal(propio.status(), 200)

      // Con el permiso concedido, la administración sí entra.
      const conPermiso = await client
        .get('/api/notices')
        .header('X-Business-Unit-Id', unidadDe(admin!))
        .loginAs(admin!.user)
      assert.equal(conPermiso.status(), 200)
    } finally {
      await setNoticeModuleEnforcement(previous)
      await cleanupActor(plain, false)
    }
  })
})
