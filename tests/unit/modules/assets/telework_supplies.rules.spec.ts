import { test } from '@japa/runner'
import {
  buildEmployeeTeleworkSupplies,
  hasOwnEquipmentChanges,
  isOwnEquipmentSuperseded,
  resolveCategoryStatus,
  resolveOwnEquipmentFeeSource,
  resolveTeleworkApplicability,
  summarizeTeleworkSupplies,
} from '#modules/assets/telework_supplies.rules'
import type {
  EmployeeTeleworkSuppliesDto,
  TeleworkCoverageRow,
  TeleworkProfile,
  TeleworkSupplyCategoryDto,
} from '#modules/assets/dto/telework_supplies.dto'
import type { OwnEquipmentDeclarationDto } from '#modules/assets/dto/own_equipment_declarations.dto'
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

/** Declaración vigente de equipo propio; por defecto silla vigente del colaborador 1. */
function makeDeclaration(
  overrides: Partial<OwnEquipmentDeclarationDto> = {}
): OwnEquipmentDeclarationDto {
  return {
    declarationId: 41,
    employeeId: 1,
    category: 'ergonomic_chair',
    description: 'Silla propia con respaldo ajustable',
    conditions: null,
    startDate: '2026-11-01',
    monthlyFee: 350,
    status: 'active',
    createdAt: '2026-11-01T16:02:11.000Z',
    endDate: null,
    closedReason: null,
    feeSource: 'adjusted',
    ...overrides,
  }
}

/** Mapa categoría → declaración vigente, el punto de extensión de la regla pura. */
function ownEquipmentMap(
  ...declarations: OwnEquipmentDeclarationDto[]
): ReadonlyMap<SupplyTypeTeleworkCategory, OwnEquipmentDeclarationDto> {
  return new Map(declarations.map((declaration) => [declaration.category, declaration]))
}

/** Categoría de la matriz ya aplicada por índice; falla si el colaborador no aplica. */
function categoryAt(
  matrix: EmployeeTeleworkSuppliesDto,
  index: 0 | 1 | 2
): TeleworkSupplyCategoryDto {
  if (!matrix.applies) throw new Error('la matriz no aplica en este caso')
  return matrix.categories[index]
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
    applies: true,
    isLegallyRequired: true,
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
    applies: true,
    isLegallyRequired: true,
    deliveredCount: 1,
    shippingCount: 0,
    ownEquipmentCount: 0,
    uncoveredCount: 1,
    unsignedCustodyCount: 1,
  })

  const belowThresholdMatrix = buildEmployeeTeleworkSupplies(
    makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.HYBRID, teleworkPercentage: 39.99 }),
    [makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active', hasContract: true })]
  )

  assert.deepEqual(summarizeTeleworkSupplies(belowThresholdMatrix), {
    applies: true,
    isLegallyRequired: false,
    deliveredCount: 1,
    shippingCount: 0,
    ownEquipmentCount: 0,
    uncoveredCount: 1,
    unsignedCustodyCount: 0,
  })

  const noneMatrix = buildEmployeeTeleworkSupplies(
    makeProfile({ workSchedule: EMPLOYEE_WORK_SCHEDULE.ONSITE, teleworkPercentage: 0 }),
    []
  )

  assert.deepEqual(summarizeTeleworkSupplies(noneMatrix), {
    applies: false,
    isLegallyRequired: false,
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
      ownEquipmentMap(makeDeclaration({ category: 'ergonomic_chair' }))
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

test('la categoría con declaración vigente sale own_equipment con su declaración (CA-1, regla 6)', ({
  assert,
}) => {
  const declaration = makeDeclaration({ category: 'ergonomic_chair' })
  const matrix = buildEmployeeTeleworkSupplies(makeProfile(), [], ownEquipmentMap(declaration))

  const chair = categoryAt(matrix, 0)
  assert.equal(chair.category, 'ergonomic_chair')
  assert.equal(chair.status, 'own_equipment')
  assert.isEmpty(chair.assets)
  assert.equal(chair.ownEquipment, declaration)
})

test('el activo manda sobre la declaración, que sigue vigente (regla 7, CA-11)', ({ assert }) => {
  const declaration = makeDeclaration({ category: 'ergonomic_chair' })
  const matrix = buildEmployeeTeleworkSupplies(
    makeProfile(),
    [makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active', hasContract: true })],
    ownEquipmentMap(declaration)
  )

  const chair = categoryAt(matrix, 0)
  assert.equal(chair.status, 'delivered')
  assert.lengthOf(chair.assets, 1)
  // La declaración sigue vigente aunque el activo mande en el estado (R5, regla 7).
  assert.equal(chair.ownEquipment, declaration)
})

test('el aditamento declarado pasa de not_delivered a own_equipment (CA-10)', ({ assert }) => {
  const declaration = makeDeclaration({ category: 'accessory' })

  const without = buildEmployeeTeleworkSupplies(makeProfile(), [])
  assert.equal(categoryAt(without, 2).status, 'not_delivered')

  const matrix = buildEmployeeTeleworkSupplies(makeProfile(), [], ownEquipmentMap(declaration))
  const accessory = categoryAt(matrix, 2)
  assert.equal(accessory.category, 'accessory')
  assert.equal(accessory.status, 'own_equipment')
  assert.equal(accessory.ownEquipment, declaration)
})

test('el resumen cuenta la declaración aparte y descuenta el pendiente (CA-1)', ({ assert }) => {
  // Cómputo en envío: la categoría no cuenta como sin cubrir y no lleva declaración.
  const rows = [
    makeRow({ category: 'computing_equipment', assignmentStatus: 'shipping', hasContract: false }),
  ]
  const declaration = makeDeclaration({ category: 'ergonomic_chair' })

  const baseSummary = summarizeTeleworkSupplies(buildEmployeeTeleworkSupplies(makeProfile(), rows))
  const withDeclaration = buildEmployeeTeleworkSupplies(
    makeProfile(),
    rows,
    ownEquipmentMap(declaration)
  )
  const summary = summarizeTeleworkSupplies(withDeclaration)

  // La declaración suma un equipo propio y descuenta el pendiente de la silla.
  assert.equal(summary.ownEquipmentCount, baseSummary.ownEquipmentCount + 1)
  assert.equal(summary.uncoveredCount, baseSummary.uncoveredCount - 1)

  // `delivered`/`shipping` sin declaración: `ownEquipment` nulo y conteos intactos.
  const computing = categoryAt(withDeclaration, 1)
  assert.equal(computing.status, 'shipping')
  assert.isNull(computing.ownEquipment)
  assert.equal(summary.shippingCount, baseSummary.shippingCount)

  const chair = categoryAt(withDeclaration, 0)
  assert.equal(chair.status, 'own_equipment')
  assert.equal(chair.ownEquipment, declaration)
})

test('un mapa vacío no cambia nada (la hermana anterior sigue igual)', ({ assert }) => {
  const rows = [makeRow({ category: 'ergonomic_chair', assignmentStatus: 'active' })]
  const implicit = buildEmployeeTeleworkSupplies(makeProfile(), rows)
  const explicit = buildEmployeeTeleworkSupplies(makeProfile(), rows, new Map())

  assert.deepEqual(explicit, implicit)
  // Ninguna categoría porta declaración sin mapa.
  assert.isNull(categoryAt(explicit, 0).ownEquipment)
  assert.isNull(categoryAt(explicit, 1).ownEquipment)
})

test('resolveOwnEquipmentFeeSource decide el origen comparando centavos, nunca flotantes', ({
  assert,
}) => {
  // Coinciden exactamente: la cuota es la estándar.
  assert.equal(resolveOwnEquipmentFeeSource(350, 350), 'default')
  assert.equal(resolveOwnEquipmentFeeSource(350, 350.0), 'default')

  // Sin cuota estándar no hay precarga posible: siempre ajustada.
  assert.equal(resolveOwnEquipmentFeeSource(350, null), 'adjusted')

  // Montos distintos: cuota ajustada por RH.
  assert.equal(resolveOwnEquipmentFeeSource(500, 350), 'adjusted')

  // Centavos: el redondeo a centavos evita el ruido de punto flotante.
  assert.equal(resolveOwnEquipmentFeeSource(0.3, 0.3), 'default')
  assert.equal(resolveOwnEquipmentFeeSource(0.29, null), 'adjusted')
})

test('isOwnEquipmentSuperseded solo con vigente y categoria cubierta', ({ assert }) => {
  // Cubierta (entregada o en envío) con declaración vigente: el aviso aplica.
  assert.isTrue(isOwnEquipmentSuperseded('delivered', true))
  assert.isTrue(isOwnEquipmentSuperseded('shipping', true))

  // Cubierta por equipo propio no se sustituye por sí misma.
  assert.isFalse(isOwnEquipmentSuperseded('own_equipment', true))

  // Sin declaración vigente no hay nada que sustituir.
  assert.isFalse(isOwnEquipmentSuperseded('delivered', false))
  assert.isFalse(isOwnEquipmentSuperseded('uncovered', false))
  assert.isFalse(isOwnEquipmentSuperseded('not_delivered', false))
})

test('hasOwnEquipmentChanges exige un cambio real en cuota, descripcion o condiciones', ({
  assert,
}) => {
  const current = { monthlyFee: 350, description: 'Silla', conditions: null as string | null }

  // Sin diferencias no es cambio.
  assert.isFalse(hasOwnEquipmentChanges(current, { monthlyFee: 350, description: 'Silla' }))

  // La cuota se compara en centavos.
  assert.isFalse(
    hasOwnEquipmentChanges(current, { monthlyFee: 350.0, description: 'Silla', conditions: null })
  )

  // Descripción normalizada con trim.
  assert.isFalse(
    hasOwnEquipmentChanges(
      { ...current, description: ' x ' },
      { monthlyFee: 350, description: 'x', conditions: null }
    )
  )

  // Los opcionales ausentes heredan el valor vigente.
  assert.isFalse(hasOwnEquipmentChanges(current, { monthlyFee: 350 }))

  // Condiciones vacías normalizan a null.
  assert.isFalse(
    hasOwnEquipmentChanges(current, { monthlyFee: 350, conditions: '' })
  )

  // Cambios reales.
  assert.isTrue(hasOwnEquipmentChanges(current, { monthlyFee: 420 }))
  assert.isTrue(hasOwnEquipmentChanges(current, { monthlyFee: 350, description: 'b' }))
  assert.isTrue(
    hasOwnEquipmentChanges(current, { monthlyFee: 350, conditions: 'x' })
  )
})
