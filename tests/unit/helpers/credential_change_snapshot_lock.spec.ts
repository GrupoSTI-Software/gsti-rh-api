import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'

interface SnapshotLockCase {
  readonly name: string
  readonly path: string
  readonly transactionMarker: string
  readonly model: 'Person' | 'Employee' | 'User'
  readonly updateCall: string
}

const cases: readonly SnapshotLockCase[] = [
  {
    name: 'M1',
    path: 'app/controllers/person_controller.ts',
    transactionMarker: 'const { updatePerson, emailMirror } = await db.transaction(async (trx) => {',
    model: 'Person',
    updateCall: 'personService.update',
  },
  {
    name: 'M6',
    path: 'app/controllers/employee_controller.ts',
    transactionMarker: 'const { updateEmployee, emailMirror } = await db.transaction(async (trx) => {',
    model: 'Employee',
    updateCall: 'employeeService.update',
  },
  {
    name: 'M4/M5',
    path: 'app/controllers/user_controller.ts',
    transactionMarker: 'const { updateUser, emailMirror } = await db.transaction(async (trx) => {',
    model: 'User',
    updateCall: 'userService.update',
  },
]

test('la imagen previa se bloquea como primera operacion dentro de cada transaccion', async ({
  assert,
}) => {
  for (const snapshotCase of cases) {
    const source = await readFile(join(process.cwd(), snapshotCase.path), 'utf8')
    const markerIndex = source.indexOf(snapshotCase.transactionMarker)
    assert.isAtLeast(markerIndex, 0, `${snapshotCase.name}: transacción`)

    const bodyStart = markerIndex + snapshotCase.transactionMarker.length
    const body = source.slice(bodyStart, source.indexOf('return {', bodyStart))
    const blockingRead = new RegExp(
      `^\\s*const before = await ${snapshotCase.model}\\.query\\(\\{ client: trx \\}\\)[\\s\\S]*?\\.forUpdate\\(\\)[\\s\\S]*?\\.first\\(\\)`
    )

    assert.match(body, blockingRead, `${snapshotCase.name}: lectura bloqueante inicial`)
    assert.isBelow(
      body.indexOf('.forUpdate()'),
      body.indexOf(snapshotCase.updateCall),
      `${snapshotCase.name}: snapshot antes de actualizar`
    )
  }
})
