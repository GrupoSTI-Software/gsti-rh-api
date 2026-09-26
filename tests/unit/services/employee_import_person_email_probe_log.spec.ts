import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const SERVICE_FILE = join(process.cwd(), 'app/services/employee_service.ts')
const CONTROLLER_FILE = join(process.cwd(), 'app/controllers/employee_controller.ts')

/**
 * USRH1789762889970 (D7) — el rastro del sondeo alcanza la carga masiva.
 *
 * `importFromExcel` crea personas con `createPerson`, que es privado, no recibe
 * actor y NO comprueba unicidad: guarda directo. Registrar el desenlace exige
 * dos cosas, no una llamada suelta: (1) propagar quién subió el archivo hasta
 * `createPerson`, y (2) una consulta de existencia por fila para poder decidir
 * `outcome`.
 *
 * Ninguna prueba de integración real corre un import completo contra la base de
 * datos (demasiado pesado y con efectos en biométricos/ZKTeco); se verifica por
 * contenido de fuente, igual que el resto de specs de importación de este
 * directorio (`employee_import_excel_bulk_performance.spec.ts`).
 */
function serviceContent(): string {
  return readFileSync(SERVICE_FILE, 'utf-8')
}

/** El bloque del registro por fila dentro de `createPerson`, hasta el `save()`. */
function createPersonProbeBlock(): string {
  const content = serviceContent()
  const start = content.indexOf('const importedEmail =')
  const end = content.indexOf('await person.save()', start)
  return start >= 0 && end > start ? content.slice(start, end) : ''
}

/**
 * Quita los comentarios de línea completa: los comentarios del bloque CITAN a
 * propósito lo prohibido (`blindIndex('')`, un `continue`), y las aserciones
 * sobre el código no deben confundir la cita con la llamada.
 */
function stripLineComments(source: string): string {
  return source
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

test.group('employee_service importFromExcel — rastro del sondeo por fila (D7)', () => {
  test('registra el intento de cada fila con correo personal no vacío', ({ assert }) => {
    const block = createPersonProbeBlock()

    assert.isNotEmpty(block, 'el registro por fila no vive en `createPerson`')

    // El hash es el mismo que persiste `people.person_email_hash`, y el correo
    // en claro NUNCA se guarda: el registro solo lleva la huella.
    assert.include(block, 'const emailHash = blindIndex(importedEmail)')
    assert.notInclude(block, 'personEmail:')

    assert.include(block, 'await PersonEmailProbeLogService.log({')
    assert.include(block, "path: 'import',")
    assert.include(block, 'personEmailHash: emailHash,')
    assert.include(block, "outcome: taken ? 'rejected_not_available' : 'accepted',")
    assert.include(block, 'actorUserId,')
    assert.include(block, 'businessUnitScope,')
    assert.include(block, 'targetPersonId: null,')
  })

  test('el correo vacío y el placeholder de `importSensitiveValueOrDefault` no dejan rastro', ({
    assert,
  }) => {
    const block = createPersonProbeBlock()

    // El valor se recorta ANTES de decidir: en blanco no es intento.
    assert.include(
      block,
      "const importedEmail = typeof person.personEmail === 'string' ? person.personEmail.trim() : ''"
    )
    assert.include(block, "if (importedEmail !== '') {")
    // Hashear el vacío produce una constante que envenenaría la colección.
    const code = stripLineComments(block)
    assert.notMatch(code, /blindIndex\(\s*''\s*\)/)
    assert.notInclude(code, 'blindIndex(person.personEmail)')
  })

  test('la existencia se consulta sin filtro de empresa: el correo es único global', ({ assert }) => {
    const block = createPersonProbeBlock()

    // Con una query pelada el mixin de tenant acota a la empresa del actor, y un
    // correo tomado por OTRA empresa se leería como libre: el `outcome` mentiría.
    // La consulta canónica ya corre sin filtro.
    assert.include(block, 'personEmailExistsGlobally(importedEmail, 0)')
    assert.notInclude(stripLineComments(block), 'Person.query()')
  })

  test('el registro por fila es de apoyo: nunca corta ni aborta la importación', ({ assert }) => {
    const block = createPersonProbeBlock()
    const code = stripLineComments(block)

    assert.include(block, 'try {')
    assert.include(block, 'catch {')
    // NUNCA un corte de fila ni un throw por esto: la fila se importa igual.
    assert.notInclude(code, 'continue')
    assert.notInclude(code, 'throw ')
  })

  test('el registro por fila no consume cuota de los contadores del sondeo', ({ assert }) => {
    const content = serviceContent()

    // La carga masiva no pasa por /api/persons: solo registra. Meterla al
    // contador garantizaría el bloqueo en cualquier lote grande.
    assert.notInclude(content, 'person_email_probe_throttle')
    assert.notInclude(content, 'userThrottle.count')
    assert.notInclude(content, 'businessThrottle.count')
  })

  test('quien subió el archivo se propaga hasta `createPerson`', ({ assert }) => {
    const content = serviceContent()
    const controller = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(
      content,
      'async importFromExcel(\n    file: any,\n    allowedBusinessUnitIds: number[] = [],\n    actorUserId: number | null = null\n  ): Promise<EmployeeImportResult>'
    )
    assert.include(
      content,
      'private async createPerson(\n    employeeData: any,\n    businessUnitId: number,\n    actorUserId: number | null,\n    businessUnitScope: number[]\n  )'
    )
    // El único llamador pasa el actor y el scope del actor.
    assert.include(
      content,
      'await this.createPerson(employeeData, businessUnitId!, actorUserId, allowedBusinessUnitIds)'
    )
    // El controlador pasa el usuario autenticado que subió el archivo.
    assert.include(controller, 'await employeeService.importFromExcel(')
    assert.include(controller, 'ctx.auth.user?.userId ?? null')
  })
})
