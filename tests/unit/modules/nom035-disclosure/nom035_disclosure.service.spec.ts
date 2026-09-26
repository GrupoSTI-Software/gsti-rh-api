import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import Nom035DisclosureService from '../../../../app/modules/nom035-disclosure/nom035_disclosure.service.js'
import type { Nom035DisclosureRepository } from '../../../../app/modules/nom035-disclosure/nom035_disclosure.repository.js'
import type { TabulationResult } from '../../../../app/interfaces/questionnaire_tabulation.interface.js'
import { Nom035DisclosureServiceError } from '../../../../app/exceptions/nom035_disclosure_service_error.js'

function makeI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
  } as unknown as I18n
}

type RepoState = {
  employeeContext: { employeeId: number; branchOfficeId: number | null } | null
  branchInScope: { branchOfficeId: number; businessUnitId: number; branchOfficeName: string } | null
  latestRound: { applicationId: number } | null
}

function makeRepo(state: RepoState): Nom035DisclosureRepository {
  return {
    async findEmployeeContextByPerson() {
      return state.employeeContext
    },
    async findBranchOfficeInScope() {
      return state.branchInScope
    },
    async listBranchOfficesInScope() {
      return []
    },
    async findLatestTabulatedRound() {
      return state.latestRound
    },
  }
}

function makeTabulationResult(): TabulationResult {
  return {
    applicationId: 99,
    instrumentCode: 'GUIA-III-NOM035',
    respondersCount: 12,
    overall: { score: 120, riskLevel: 'alto' },
    categories: [
      { code: 'CAT-I', score: 14, riskLevel: 'medio', respondersCount: 12 },
      { code: 'CAT-IV', score: 10, riskLevel: 'alto', respondersCount: 3 },
    ],
    domains: [
      { code: 'DOM-A', categoryCode: 'CAT-I', score: 8, riskLevel: 'bajo', respondersCount: 12 },
      { code: 'DOM-B', categoryCode: 'CAT-IV', score: 11, riskLevel: 'alto', respondersCount: 2 },
    ],
    employees: [],
  }
}

test.group('Nom035DisclosureService', () => {
  test('sin permiso read-all ignora branchOfficeId y usa el propio', async ({ assert }) => {
    let selectedBranch: number | null = null
    const repo = makeRepo({
      employeeContext: { employeeId: 1, branchOfficeId: 77 },
      branchInScope: { branchOfficeId: 77, businessUnitId: 2, branchOfficeName: 'Sucursal Centro' },
      latestRound: { applicationId: 99 },
    })
    const trackedRepo: Nom035DisclosureRepository = {
      ...repo,
      async findBranchOfficeInScope(branchOfficeId, allowedBusinessUnitIds) {
        selectedBranch = branchOfficeId
        return repo.findBranchOfficeInScope(branchOfficeId, allowedBusinessUnitIds)
      },
    }

    const service = new Nom035DisclosureService({
      repository: trackedRepo,
      roleService: {
        async hasAccess() {
          return false
        },
      } as never,
      tabulationService: {
        async getAggregates() {
          return makeTabulationResult()
        },
      } as never,
    })

    const result = await service.getDisclosure({
      user: { personId: 10, roleId: 2 } as never,
      query: { branchOfficeId: 999 },
      allowedBusinessUnitIds: [2],
      i18n: makeI18nStub(),
    })

    assert.equal(selectedBranch, 77)
    assert.equal(result.available, true)
    if (result.available) {
      assert.equal(result.branchOfficeId, 77)
      assert.equal(result.branchOfficeName, 'Sucursal Centro')
    }
  })

  test('con permiso read-all permite consultar sucursal solicitada', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: { employeeId: 1, branchOfficeId: 77 },
        branchInScope: { branchOfficeId: 15, businessUnitId: 2, branchOfficeName: 'Sucursal Norte' },
        latestRound: { applicationId: 99 },
      }),
      roleService: {
        async hasAccess() {
          return true
        },
      } as never,
      tabulationService: {
        async getAggregates() {
          return makeTabulationResult()
        },
      } as never,
    })

    const result = await service.getDisclosure({
      user: { personId: 10, roleId: 2 } as never,
      query: { branchOfficeId: 15 },
      allowedBusinessUnitIds: [2],
      i18n: makeI18nStub(),
    })

    assert.equal(result.available, true)
    if (result.available) {
      assert.equal(result.branchOfficeId, 15)
      assert.equal(result.branchOfficeName, 'Sucursal Norte')
    }
  })

  test('regresa available=false cuando no hay ronda tabulada', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: { employeeId: 1, branchOfficeId: 77 },
        branchInScope: { branchOfficeId: 77, businessUnitId: 2, branchOfficeName: 'Sucursal Centro' },
        latestRound: null,
      }),
      roleService: {
        async hasAccess() {
          return false
        },
      } as never,
    })

    const result = await service.getDisclosure({
      user: { personId: 10, roleId: 2 } as never,
      query: {},
      allowedBusinessUnitIds: [2],
      i18n: makeI18nStub(),
    })

    assert.deepEqual(result, {
      available: false,
      branchOfficeId: 77,
      branchOfficeName: 'Sucursal Centro',
    })
  })

  test('suprime puntajes para categorías y dominios con muestra menor a k', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: { employeeId: 1, branchOfficeId: 77 },
        branchInScope: { branchOfficeId: 77, businessUnitId: 2, branchOfficeName: 'Sucursal Centro' },
        latestRound: { applicationId: 99 },
      }),
      roleService: {
        async hasAccess() {
          return false
        },
      } as never,
      tabulationService: {
        async getAggregates() {
          return makeTabulationResult()
        },
      } as never,
    })

    const result = await service.getDisclosure({
      user: { personId: 10, roleId: 2 } as never,
      query: {},
      allowedBusinessUnitIds: [2],
      i18n: makeI18nStub(),
    })

    assert.equal(result.available, true)
    if (!result.available) return

    assert.equal(result.categories[0].suppressed, false)
    assert.equal(result.categories[0].score, 14)
    assert.equal(result.categories[1].suppressed, true)
    assert.isNull(result.categories[1].score)

    assert.equal(result.domains[0].suppressed, false)
    assert.equal(result.domains[0].score, 8)
    assert.equal(result.domains[1].suppressed, true)
    assert.isNull(result.domains[1].score)
  })

  test('lanza NO_EMPLOYEE cuando usuario no tiene empleado asociado', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: null,
        branchInScope: null,
        latestRound: null,
      }),
    })

    try {
      await service.getDisclosure({
        user: { personId: 10, roleId: 2 } as never,
        query: {},
        allowedBusinessUnitIds: [2],
        i18n: makeI18nStub(),
      })
      assert.fail('Se esperaba error NOM035.DISC.NO_EMPLOYEE')
    } catch (error) {
      assert.instanceOf(error, Nom035DisclosureServiceError)
      assert.equal((error as Nom035DisclosureServiceError).errorCode, 'NOM035.DISC.NO_EMPLOYEE')
    }
  })

  test('lanza NO_BRANCH cuando empleado no tiene centro de trabajo activo', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: { employeeId: 1, branchOfficeId: null },
        branchInScope: null,
        latestRound: null,
      }),
    })

    try {
      await service.getDisclosure({
        user: { personId: 10, roleId: 2 } as never,
        query: {},
        allowedBusinessUnitIds: [2],
        i18n: makeI18nStub(),
      })
      assert.fail('Se esperaba error NOM035.DISC.NO_BRANCH')
    } catch (error) {
      assert.instanceOf(error, Nom035DisclosureServiceError)
      assert.equal((error as Nom035DisclosureServiceError).errorCode, 'NOM035.DISC.NO_BRANCH')
    }
  })

  test('lanza NOT_FOUND cuando read-all solicita sucursal fuera de scope', async ({ assert }) => {
    const service = new Nom035DisclosureService({
      repository: makeRepo({
        employeeContext: { employeeId: 1, branchOfficeId: 77 },
        branchInScope: null,
        latestRound: null,
      }),
      roleService: {
        async hasAccess() {
          return true
        },
      } as never,
    })

    try {
      await service.getDisclosure({
        user: { personId: 10, roleId: 2 } as never,
        query: { branchOfficeId: 3000 },
        allowedBusinessUnitIds: [2],
        i18n: makeI18nStub(),
      })
      assert.fail('Se esperaba error NOM035.DISC.NOT_FOUND')
    } catch (error) {
      assert.instanceOf(error, Nom035DisclosureServiceError)
      assert.equal((error as Nom035DisclosureServiceError).errorCode, 'NOM035.DISC.NOT_FOUND')
    }
  })
})
