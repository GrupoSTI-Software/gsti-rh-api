import { test } from '@japa/runner'
import {
  buildEmployeeTeleworkSupplies,
  resolveCategoryStatus,
  resolveTeleworkApplicability,
  summarizeTeleworkSupplies,
} from '#modules/assets/telework_supplies.rules'
import type {
  TeleworkCoverageRow,
  TeleworkProfile,
} from '#modules/assets/dto/telework_supplies.dto'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'

/**
 * Tests unitarios de las reglas puras del cumplimiento de insumos de
 * teletrabajo (NOM-037-STPS-2023 5.7, VLRH-H1791485252682). Sin BD: cubren
 * la aplicabilidad con el umbral inclusivo, la prioridad de los cinco
 * estados, el equipo propio declarado, el resumen por estado y el invariante
 * de tres renglones.
 */

/** Perfil mínimo del colaborador; por defecto aplica (Remote 100). */
function makeProfile(overrides: Partial<TeleworkProfile> = {}): TeleworkProfile {
  return {
    employeeId: 1,
    workSchedule: EMPLOYEE_WORK_SCHEDULE.REMOTE,
    teleworkPercentage: 100,
    isDeleted: false,
    ...overrides,
  }
}

/** Renglón de cobertura; por defecto un activo entregado y firmado. */
function makeRow(overrides: Partial<TeleworkCoverageRow> = {}): TeleworkCoverageRow {
  return {
    employeeId: 1,
    employeeSupplyId: 1,
    supplyId: 1,
    name: 'Insumo',
    fileNumber: 'ACT-1',
    assignmentStatus: 'active',
    category: 'ergonomic_chair',
    hasContract: true,
    assignedAt: '2026-01-01',
    ...overrides,
  }
}

test('aplica solo a Remote o Hybrid con porcentaje > 0; la baja no aplica (R4, propias 8-9)', ({
  assert,
}) => {
  assert.deepEqual(resolveTeleworkApplicability(makeProfile()), {
    applies: true,
    isLegallyRequired: true,
  })
  assert.deepEqual(
    resolveTeleworkApplicability(
      makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.HYBRID, teleworkPercentage: 40 })
    ),
    { applies: true, isLegallyRequired: true }
  )
  assert.deepEqual(
    resolveTeleworkApplicability(
      makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.HYBRID, teleworkPercentage: 39.99 })
    ),
    { applies: true, isLegallyRequired: false }
  )
  assert.deepEqual(
    resolveTeleworkApplicability(
      makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.HYBRID, teleworkPercentage: 20 })
    ),
    { applies: true, isLegallyRequired: false }
  )
  assert.deepEqual(
    resolveTeleworkApplicability(makeProfile({ teleworkPercentage: 0 })),
    { applies: false, isLegallyRequired: false }
  )
  assert.deepEqual(
    resolveTeleworkApplicability(
      makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.ONSITE, teleworkPercentage: 100 })
    ),
    { applies: false, isLegallyRequired: false }
  )
  assert.deepEqual(
    resolveTeleworkApplicability(
      makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.ONSITE, teleworkPercentage: 50 })
    ),
    { applies: false, isLegallyRequired: false }
  )
  assert.deepEqual(resolveTeleworkApplicability(makeProfile({ isDeleted: true })), {
    applies: false,
    isLegallyRequired: false,
  })
})

test('la prioridad de estados no depende del orden de filas (R5, R6)', ({ assert }) => {
  const shipping = makeRow({ assignmentStatus: 'shipping', hasContract: false })
  const active = makeRow({ employeeSupplyId: 2, assignmentStatus: 'active', hasContract: true })

  assert.equal(resolveCategoryStatus('ergonomic_chair', [shipping, active], new Set()), 'delivered')
  assert.equal(resolveCategoryStatus('ergonomic_chair', [active, shipping], new Set()), 'delivered')

  assert.equal(resolveCategoryStatus('ergonomic_chair', [shipping], new Set()), 'shipping')
  assert.equal(resolveCategoryStatus('ergonomic_chair', [], new Set()), 'uncovered')
  assert.equal(resolveCategoryStatus('computing_equipment', [], new Set()), 'uncovered')
  assert.equal(resolveCategoryStatus('accessory', [], new Set()), 'not_delivered')
})

test('equipo propio declarado solo entra por ownEquipmentCategories', ({ assert }) => {
  assert.equal(resolveCategoryStatus('ergonomic_chair', [], new Set()), 'uncovered')
  assert.equal(resolveCategoryStatus('accessory', [], new Set()), 'not_delivered')

  const ownChair = new Set<SupplyTypeTeleworkCategory>(['ergonomic_chair'])
  assert.equal(resolveCategoryStatus('ergonomic_chair', [], ownChair), 'own_equipment')

  const shipping = makeRow({ assignmentStatus: 'shipping', hasContract: false })
  assert.equal(resolveCategoryStatus('ergonomic_chair', [shipping], ownChair), 'shipping')
})

test('el resumen cuenta por estado, silla y cómputo como sin cubrir, y el envío no firma (R5, R6, propia 6)', ({
  assert,
}) => {
  const matrix = buildEmployeeTeleworkSupplies(makeProfile(), [
    makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active', hasContract: true }),
    makeRow({
      employeeSupplyId: 2,
      category: 'ergonomic_chair',
      assignmentStatus: 'shipping',
      hasContract: false,
    }),
    makeRow({
      employeeSupplyId: 3,
      category: 'computing_equipment',
      assignmentStatus: 'shipping',
      hasContract: false,
    }),
  ])

  assert.deepEqual(summarizeTeleworkSupplies(matrix), {
    deliveredCount: 1,
    shippingCount: 1,
    ownEquipmentCount: 0,
    uncoveredCount: 0,
    unsignedCustodyCount: 0,
  })

  const unsignedMatrix = buildEmployeeTeleworkSupplies(makeProfile(), [
    makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active', hasContract: false }),
  ])

  assert.deepEqual(summarizeTeleworkSupplies(unsignedMatrix), {
    deliveredCount: 1,
    shippingCount: 0,
    ownEquipmentCount: 0,
    uncoveredCount: 1,
    unsignedCustodyCount: 1,
  })

  const noneMatrix = buildEmployeeTeleworkSupplies(
    makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.ONSITE, teleworkPercentage: 0 }),
    []
  )

  assert.deepEqual(summarizeTeleworkSupplies(noneMatrix), {
    deliveredCount: 0,
    shippingCount: 0,
    ownEquipmentCount: 0,
    uncoveredCount: 0,
    unsignedCustodyCount: 0,
  })
})

test('el invariante del resumen se cumple (§11)', ({ assert }) => {
  const matrices = [
    buildEmployeeTeleworkSupplies(makeProfile(), [
      makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active', hasContract: true }),
    ]),
    buildEmployeeTeleworkSupplies(
      makeProfile(),
      [
        makeRow({
          category: 'computing_equipment',
          assignmentStatus: 'shipping',
          hasContract: false,
        }),
      ],
      new Set<SupplyTypeTeleworkCategory>(['ergonomic_chair'])
    ),
    buildEmployeeTeleworkSupplies(makeProfile(), []),
  ]

  const accessoryStatus = (matrix: (typeof matrices)[number]) => {
    if (!matrix.applies) {
      return null
    }
    return matrix.categories[2].status
  }

  for (const matrix of matrices) {
    const summary = summarizeTeleworkSupplies(matrix)
    const accessoryCount = accessoryStatus(matrix) === 'not_delivered' ? 1 : 0
    const total =
      summary.deliveredCount +
      summary.shippingCount +
      summary.ownEquipmentCount +
      summary.uncoveredCount +
      accessoryCount

    assert.equal(total, matrix.applies ? 3 : 0)
  }
})

test('las categorías salen siempre en el orden de la norma (R1)', ({ assert }) => {
  const matrix = buildEmployeeTeleworkSupplies(makeProfile(), [
    makeRow({ category: 'accessory', assignmentStatus: 'active', hasContract: true }),
    makeRow({ employeeSupplyId: 2, category: 'computing_equipment' }),
    makeRow({ employeeSupplyId: 3, category: 'ergonomic_chair' }),
  ])

  assert.isTrue(matrix.applies)
  assert.deepEqual(
    matrix.categories.map((category) => category.category),
    ['ergonomic_chair', 'computing_equipment', 'accessory']
  )
})
