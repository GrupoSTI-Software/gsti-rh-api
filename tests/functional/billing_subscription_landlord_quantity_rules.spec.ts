import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Employee from '#models/employee'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toBusinessDateString } from '#utils/business_date'

/**
 * USRH1785962095089 — reglas de cantidad (bloques de 10, mínimo por plantilla
 * activa) y prueba única por empresa dentro del motor compartido de
 * contratación (`createSubscriptionWithin`) y del cambio de plan.
 */

async function createPublishedPlan(stamp: number, trialDays = 7): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Quantity Rules Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1785962095089',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: trialDays,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Quantity Rules BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `quantity-rules-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Quantity Rules Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

/** Da de alta `count` empleados vigentes (opcionalmente con fecha de baja) en la empresa. */
async function seedEmployees(
  businessUnitId: number,
  stamp: number,
  count: number,
  terminated = false
): Promise<number[]> {
  const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
  const personIds: number[] = []

  for (let i = 0; i < count; i++) {
    const person = new Person()
    person.personFirstname = 'QtyRule'
    person.personLastname = 'Seed'
    person.personSecondLastname = String(i)
    person.personEmail = `qty-rule-${stamp}-${i}@gsti-tests.local`
    await person.save()
    personIds.push(person.personId)

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'QtyRule'
    employee.employeeLastName = 'Seed'
    employee.employeeCode = `QR-${stamp}-${i}`
    employee.employeePayrollNum = `QR-${stamp}-${i}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    if (terminated) {
      employee.employeeTerminatedDate = DateTime.now().minus({ days: 1 }).toISODate()
    }
    await employee.save()
  }

  return personIds
}

async function cleanup(businessUnitId: number, planId: number, personIds: number[] = []) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await Employee.query().where('business_unit_id', businessUnitId).delete()
  if (personIds.length > 0) {
    await Person.query().whereIn('person_id', personIds).delete()
  }
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('BillingSubscriptionService.createSubscription — reglas de cantidad (USRH1785962095089)', () => {
  test('Criterio 1 — alta válida: 47 activos, contractedEmployees=50 crea con 50', async ({
    assert,
  }) => {
    const stamp = Date.now() + 100
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'valid')
    const personIds = await seedEmployees(businessUnit.businessUnitId, stamp, 47)

    const service = new BillingSubscriptionService()
    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 50,
      })
      assert.equal(subscription.billingSubscriptionStatus, 'trialing')
      assert.equal(subscription.billingSubscriptionContractedEmployees, 50)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId, personIds)
    }
  })

  test('Criterio 2 — rechazo por debajo de la plantilla activa con data {active, minimum}', async ({
    assert,
  }) => {
    const stamp = Date.now() + 101
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'below')
    const personIds = await seedEmployees(businessUnit.businessUnitId, stamp, 47)

    const service = new BillingSubscriptionService()
    try {
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 40,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      const error = thrown as {
        httpStatus?: number
        errorCode?: string
        key?: string
        data?: Record<string, number>
      }
      assert.equal(error.httpStatus, 422)
      assert.equal(error.errorCode, 'PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT')
      assert.equal(error.key, 'cantidad-menor-a-plantilla-activa')
      assert.deepEqual(error.data, { active: 47, minimum: 50 })

      const rows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(rows, 0)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId, personIds)
    }
  })

  test('Criterio 3 — rechazo por cantidad fuera de bloque de 10 (55) sin normalizar en silencio', async ({
    assert,
  }) => {
    const stamp = Date.now() + 102
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'block')

    const service = new BillingSubscriptionService()
    try {
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 55,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN')

      const rows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(rows, 0)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
    }
  })

  test('Criterio 3 — rechazo por cantidad sobre el tope defensivo', async ({ assert }) => {
    const stamp = Date.now() + 103
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'cap')

    const service = new BillingSubscriptionService()
    try {
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 100_010,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP')
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
    }
  })

  test('Criterio 9 — alta sin contractedEmployees usa el mínimo contratable, no el conteo crudo', async ({
    assert,
  }) => {
    const stamp = Date.now() + 104
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'default')
    const personIds = await seedEmployees(businessUnit.businessUnitId, stamp, 47)

    const service = new BillingSubscriptionService()
    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
      })
      assert.equal(subscription.billingSubscriptionContractedEmployees, 50)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId, personIds)
    }
  })

  test('Conteo canónico — empleado con fecha de baja no cuenta como activo', async ({ assert }) => {
    const stamp = Date.now() + 105
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'terminated')
    const activePersonIds = await seedEmployees(businessUnit.businessUnitId, stamp, 5, false)
    const terminatedPersonIds = await seedEmployees(
      businessUnit.businessUnitId,
      stamp + 1,
      20,
      true
    )

    const service = new BillingSubscriptionService()
    try {
      // 5 activos + 20 dados de baja: el mínimo debe calcularse sobre los 5
      // activos (mínimo 10), no sobre los 25 totales.
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
      })
      assert.equal(subscription.billingSubscriptionContractedEmployees, 10)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId, [
        ...activePersonIds,
        ...terminatedPersonIds,
      ])
    }
  })

  test('Criterio 5 — prueba única por empresa: alta con plan distinto no otorga prueba de nuevo', async ({
    assert,
  }) => {
    const stamp = Date.now() + 106
    const planId = await createPublishedPlan(stamp, 7)
    const otherPlanId = await createPublishedPlan(stamp + 1, 14)
    const businessUnit = await createBusinessUnit(stamp, 'trial-once')
    const today = toBusinessDateString()

    const service = new BillingSubscriptionService()
    try {
      const first = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })
      assert.equal(first.billingSubscriptionStatus, 'trialing')
      assert.equal(first.billingSubscriptionContractedTrialDays, 7)

      await service.cancel(first.billingSubscriptionId)

      const second = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: otherPlanId,
        contractedEmployees: 10,
      })

      assert.equal(second.billingSubscriptionStatus, 'active')
      assert.equal(second.billingSubscriptionContractedTrialDays, 0)
      assert.isNull(second.billingSubscriptionTrialEndsAt)
      assert.equal(
        second.billingSubscriptionCurrentPeriodEnd?.toISODate(),
        today
      )
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
      await BillingVolumeTier.query().where('billing_plan_id', otherPlanId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', otherPlanId).delete()
      const otherPlan = await BillingPlan.find(otherPlanId)
      if (otherPlan) {
        await otherPlan.delete()
      }
    }
  })

  test('Criterio 6 — regresión: empresa sin prueba previa nace trialing con los días del precio', async ({
    assert,
  }) => {
    const stamp = Date.now() + 107
    const planId = await createPublishedPlan(stamp, 12)
    const businessUnit = await createBusinessUnit(stamp, 'never-trialed')

    const service = new BillingSubscriptionService()
    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })
      assert.equal(subscription.billingSubscriptionStatus, 'trialing')
      assert.equal(subscription.billingSubscriptionContractedTrialDays, 12)
      assert.isNotNull(subscription.billingSubscriptionTrialEndsAt)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
    }
  })

  test('Criterio 7 — el reemplazo hereda las reglas de cantidad y prueba (USRH1785962095087)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 108
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp, 'replace-rules')

    const service = new BillingSubscriptionService()
    try {
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })
      assert.equal(original.billingSubscriptionStatus, 'trialing')

      // Cantidad inválida en el reemplazo: la transacción revierte y la
      // original sigue viva sin cambios.
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 15,
          replaceLiveSubscription: true,
        })
      } catch (error) {
        thrown = error
      }
      assert.isNotNull(thrown)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN')

      const reloadedOriginal = await BillingSubscription.find(original.billingSubscriptionId)
      assert.equal(reloadedOriginal!.billingSubscriptionStatus, 'trialing')
      assert.isNull(reloadedOriginal!.billingSubscriptionCanceledAt)

      // Cantidad válida: reemplaza y nace sin prueba (ya la gozó la original).
      const replacement = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 20,
        replaceLiveSubscription: true,
      })
      assert.equal(replacement.billingSubscriptionStatus, 'active')
      assert.equal(replacement.billingSubscriptionContractedTrialDays, 0)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
    }
  })
})

test.group('BillingSubscriptionService.changePlan — reglas de cantidad (USRH1785962095089)', () => {
  test('cambio de plan con cantidad heredada válida no rechaza', async ({ assert }) => {
    const stamp = Date.now() + 109
    const planId = await createPublishedPlan(stamp)
    const targetPlanId = await createPublishedPlan(stamp + 1)
    const businessUnit = await createBusinessUnit(stamp, 'change-plan-valid')

    const service = new BillingSubscriptionService()
    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })

      const changed = await service.changePlan(subscription.billingSubscriptionId, targetPlanId)
      assert.equal(changed.billingPlanId, targetPlanId)
    } finally {
      await cleanup(businessUnit.businessUnitId, planId)
      await BillingVolumeTier.query().where('billing_plan_id', targetPlanId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', targetPlanId).delete()
      const targetPlan = await BillingPlan.find(targetPlanId)
      if (targetPlan) {
        await targetPlan.delete()
      }
    }
  })

  test('Criterio 4 — rechaza si la plantilla creció por encima de lo contratado', async ({
    assert,
  }) => {
    const stamp = Date.now() + 110
    const planId = await createPublishedPlan(stamp)
    const targetPlanId = await createPublishedPlan(stamp + 1)
    const businessUnit = await createBusinessUnit(stamp, 'change-plan-below')

    const service = new BillingSubscriptionService()
    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 50,
      })

      const personIds = await seedEmployees(businessUnit.businessUnitId, stamp, 63)

      let thrown: unknown = null
      try {
        await service.changePlan(subscription.billingSubscriptionId, targetPlanId)
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      const error = thrown as { errorCode?: string; data?: Record<string, number> }
      assert.equal(error.errorCode, 'PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT')
      assert.deepEqual(error.data, { active: 63, minimum: 70 })

      const reloaded = await BillingSubscription.find(subscription.billingSubscriptionId)
      assert.equal(reloaded!.billingPlanId, planId)

      await cleanup(businessUnit.businessUnitId, planId, personIds)
    } finally {
      await BillingVolumeTier.query().where('billing_plan_id', targetPlanId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', targetPlanId).delete()
      const targetPlan = await BillingPlan.find(targetPlanId)
      if (targetPlan) {
        await targetPlan.delete()
      }
    }
  })
})

test.group('BillingSubscriptionService.listBusinessUnits — picker con mínimo contratable', () => {
  test('activeEmployees usa el criterio canónico y minimumContractedEmployees viaja en la respuesta', async ({
    assert,
  }) => {
    const stamp = Date.now() + 111
    const businessUnit = await createBusinessUnit(stamp, 'picker')
    const activePersonIds = await seedEmployees(businessUnit.businessUnitId, stamp, 7, false)
    const terminatedPersonIds = await seedEmployees(businessUnit.businessUnitId, stamp + 1, 3, true)

    const service = new BillingSubscriptionService()
    try {
      const businessUnits = await service.listBusinessUnits()
      const item = businessUnits.find(
        (bu) => bu.businessUnitPublicId === businessUnit.businessUnitPublicId
      )
      assert.isDefined(item)
      assert.equal(item!.activeEmployees, 7)
      assert.equal(item!.minimumContractedEmployees, 10)
    } finally {
      await Employee.query().where('business_unit_id', businessUnit.businessUnitId).delete()
      await Person.query().whereIn('person_id', [...activePersonIds, ...terminatedPersonIds]).delete()
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
  })
})
