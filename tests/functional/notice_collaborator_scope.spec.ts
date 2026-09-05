import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Notice from '#models/notice'
import NoticeRecipient from '#models/notice_recipient'

/**
 * Los avisos de un colaborador dejan de ser legibles con el token de otro
 * (ESB-04-02-08-01 §9.4, fase B3). **Primera suite de avisos del repo.**
 *
 * Hasta aquí, las cuatro rutas de lectura aceptaban `employeeId` por query y lo
 * obedecían: con el token de cualquier trabajador se podían leer —y marcar como
 * leídos— los avisos de otro. `mark-as-read` era además una escritura IDOR.
 *
 * La regla nueva: la PRESENCIA del parámetro sigue decidiendo la vista (con él,
 * la del colaborador; sin él, la de administración), pero su VALOR se descarta y
 * lo pone la sesión.
 *
 * Un `employeeId` ajeno **no devuelve 403 sino lo propio**: un 403 distinguiría
 * "existe pero no es tuyo" de "no existe" —filtrando la existencia del aviso— y
 * rompería a un cliente viejo que llevara el id desincronizado.
 *
 * Es bloqueo duro de la fase F8: persistir en el disco del trabajador la salida
 * de un endpoint que no valida propiedad convierte un fallo de autorización en
 * un residuo permanente en el aparato.
 */

const TEST_PASSWORD = 'NoticeScopeTest123!'

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

async function createActor(prefix: string): Promise<Actor> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Avisos ${prefix} ${stamp}`,
    businessUnitSlug: `avisos-${prefix}-${stamp}`,
    businessUnitLegalName: `Avisos ${prefix} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Avisos ${stamp}`,
    roleSlug: `avisos-${stamp}`,
    roleDescription: 'Rol temporal para el alcance de avisos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Avisos',
    personLastname: 'Test',
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
  employee.employeeCode = `AVISO-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `AVISO-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTerminatedDate = null
  await employee.save()

  return { user, person, employee, businessUnit, role }
}

async function cleanupActor(actor: Actor | null) {
  if (!actor) return
  await NoticeRecipient.query().where('employee_id', actor.employee.employeeId).delete()
  await Employee.query().where('employee_id', actor.employee.employeeId).delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

/** Un aviso dirigido a [actor], con su fila de destinatario. */
async function createNoticeFor(actor: Actor, subject: string): Promise<Notice> {
  const notice = await Notice.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    noticeSubject: subject,
    noticeDescription: 'Cuerpo de prueba',
    noticeType: 'text',
  })
  const recipient = new NoticeRecipient()
  recipient.noticeId = notice.noticeId
  recipient.employeeId = actor.employee.employeeId
  recipient.businessUnitId = actor.businessUnit.businessUnitId
  recipient.employeeEmail = actor.person.personEmail!
  recipient.employeeName = actor.person.personFirstname
  recipient.noticeRecipientSent = true
  recipient.noticeRecipientRead = false
  await recipient.save()
  return notice
}

test.group('Avisos — alcance por colaborador (B3)', (group) => {
  let ana: Actor | null = null
  let beto: Actor | null = null
  const avisos: number[] = []

  group.setup(async () => {
    ana = await createActor('ana')
    beto = await createActor('beto')
    const avisoDeAna = await createNoticeFor(ana, 'Aviso de Ana')
    const avisoDeBeto = await createNoticeFor(beto, 'Aviso de Beto')
    avisos.push(avisoDeAna.noticeId, avisoDeBeto.noticeId)
  })

  group.teardown(async () => {
    if (avisos.length > 0) {
      await NoticeRecipient.query().whereIn('notice_id', avisos).delete()
      await Notice.query().whereIn('notice_id', avisos).delete()
    }
    await cleanupActor(ana)
    await cleanupActor(beto)
  })

  test('el listado con el employeeId de otro devuelve LO PROPIO, no lo ajeno', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/notices')
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(beto!.user)

    response.assertStatus(200)
    const cuerpo = response.body()
    const asuntos = JSON.stringify(cuerpo)
    // Beto pidió los de Ana con el id de Ana. Recibe los suyos.
    assert.notInclude(asuntos, 'Aviso de Ana')
  })

  test('el detalle de un aviso ajeno no se entrega como propio', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/notices/${avisos[0]}`)
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(beto!.user)

    // No es 403: distinguir "existe pero no es tuyo" de "no existe" filtraría
    // la existencia del aviso.
    assert.notEqual(response.status(), 403)
    const cuerpo = JSON.stringify(response.body())
    assert.notInclude(cuerpo, 'noticeRecipientRead')
  })

  test('la cuenta de no leídos ignora el employeeId del query', async ({
    client,
    assert,
  }) => {
    const propio = await client.get('/api/notices/unread-count').loginAs(beto!.user)
    const conIdAjeno = await client
      .get('/api/notices/unread-count')
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(beto!.user)

    propio.assertStatus(200)
    conIdAjeno.assertStatus(200)
    // Mandar el id de otro no cambia nada: la cuenta es siempre la propia.
    assert.deepEqual(conIdAjeno.body(), propio.body())
  })

  test('ESCRITURA IDOR: no se puede marcar como leído el aviso de otro', async ({
    client,
    assert,
  }) => {
    await client
      .post(`/api/notices/${avisos[0]}/mark-as-read`)
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(beto!.user)

    // La fila de Ana sigue sin leer: Beto no pudo tocarla.
    const recipient = await NoticeRecipient.query()
      .where('notice_id', avisos[0])
      .where('employee_id', ana!.employee.employeeId)
      .first()
    assert.isFalse(Boolean(recipient?.noticeRecipientRead))
  })

  test('cada quien sí ve lo suyo', async ({ client, assert }) => {
    const response = await client
      .get('/api/notices')
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(ana!.user)

    response.assertStatus(200)
    assert.include(JSON.stringify(response.body()), 'Aviso de Ana')
  })

  test('B4: el listado de administración deja de cruzar empresas', async ({
    client,
    assert,
  }) => {
    // Sin employeeId es la rama de administración. Antes devolvía los avisos de
    // TODAS las empresas a cualquier autenticado: el grupo monta solo `auth()`,
    // así que el contexto de tenant está inactivo y el mixin del modelo no
    // aplica ningún filtro.
    const response = await client.get('/api/notices').loginAs(beto!.user)

    response.assertStatus(200)
    const cuerpo = JSON.stringify(response.body())
    assert.notInclude(cuerpo, 'Aviso de Ana')
  })

  test('B4: el payload deja de llevar los correos de toda la plantilla', async ({
    client,
    assert,
  }) => {
    // `notice_recipient_emails` es un longtext con los correos de TODOS los
    // destinatarios. Ningún cliente lo parsea, domina el tamaño de la respuesta
    // y con el caché acabaría en el disco de cada teléfono.
    const response = await client
      .get('/api/notices')
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(ana!.user)

    response.assertStatus(200)
    const cuerpo = JSON.stringify(response.body())
    // La clave puede seguir apareciendo serializada como nula —el modelo la
    // declara—, pero su CONTENIDO ya no viaja, que es lo que pesaba y lo que
    // acabaría en el disco de cada teléfono.
    assert.notInclude(cuerpo, '@gsti-tests.local"]')
    assert.notInclude(cuerpo, '"noticeRecipientEmails":"')
    // Y el conteo que el backoffice necesita llega calculado por el servidor.
    assert.include(cuerpo, 'noticeRecipientsCount')
  })

  test('B4: el listado trae updatedAt y type, que el detalle offline necesita',
    async ({ client, assert }) => {
    // `noticeUpdatedAt` decide si un detalle guardado sigue sirviendo sin pedir
    // los avisos uno por uno. `noticeType` es obligatorio para el computed del
    // cuerpo-archivo: sin él, el aviso saldría distinto en la lista que al
    // abrirlo, sin un solo error visible.
    const response = await client
      .get('/api/notices')
      .qs({ employeeId: ana!.employee.employeeId })
      .loginAs(ana!.user)

    const cuerpo = JSON.stringify(response.body())
    assert.include(cuerpo, 'noticeUpdatedAt')
    assert.include(cuerpo, 'noticeType')
  })
})
