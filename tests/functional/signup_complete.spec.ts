import { test } from '@japa/runner'
import SignupDraft from '#models/signup_draft'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Role from '#models/role'

/**
 * Test funcional — flujo completo de signup self-service (USRH1783712837561).
 *
 * Cubre el AC: "Dado un registro self-service válido, cuando se completa
 * signup/complete, entonces el usuario creado queda con el rol owner (resuelto
 * por slug, no roleId=1) y recibe su par de tokens de sesión; el flujo
 * start → verify-otp → complete sigue funcionando de punta a punta."
 *
 * Un solo test cubre las 3 llamadas (start, verify-otp, complete) para respetar
 * el rate limit de 5 req/min por IP configurado en `auth_signup_routes.ts`.
 */

test.group('Signup self-service (start → verify-otp → complete) — rol owner', (group) => {
  let createdBusinessUnitId: number | null = null
  let createdUserId: number | null = null
  let createdPersonId: number | null = null
  let signupEmail: string

  group.setup(() => {
    signupEmail = `owner-signup-${Date.now()}@gsti-tests.local`
  })

  group.teardown(async () => {
    if (createdUserId !== null) {
      await BusinessUnitUser.query().where('user_id', createdUserId).delete()
      await User.query().where('user_id', createdUserId).delete()
    }
    if (createdPersonId !== null) {
      await Person.query().where('person_id', createdPersonId).delete()
    }
    if (createdBusinessUnitId !== null) {
      await BusinessUnit.query().where('business_unit_id', createdBusinessUnitId).delete()
    }
    await SignupDraft.query().where('signup_draft_email', signupEmail).delete()
  })

  test('el usuario nace con rol owner y recibe su par de tokens', async ({ client, assert }) => {
    const startResponse = await client.post('/api/auth/signup/start').json({
      firstName: 'Owner',
      lastName: 'SelfService',
      businessUnitName: `Owner Signup BU ${Date.now()}`,
      email: signupEmail,
    })

    startResponse.assertStatus(200)
    const signupDraftId = startResponse.body().data?.signupDraftId
    assert.exists(signupDraftId, 'start debe retornar signupDraftId')

    const draft = await SignupDraft.query().where('signup_draft_id', signupDraftId).firstOrFail()
    assert.exists(draft.signupDraftPinCode, 'El draft debe tener un pinCode generado')

    const verifyResponse = await client.post('/api/auth/signup/verify-otp').json({
      signupDraftId,
      pinCode: draft.signupDraftPinCode,
    })

    verifyResponse.assertStatus(200)
    const signupToken = verifyResponse.body().data?.signupToken
    assert.exists(signupToken, 'verify-otp debe retornar signupToken')

    const password = 'OwnerSignupTest123!'
    const completeResponse = await client.post('/api/auth/signup/complete').json({
      signupDraftId,
      signupToken,
      password,
      passwordConfirm: password,
    })

    completeResponse.assertStatus(200)
    const body = completeResponse.body()
    assert.equal(body.type, 'success')
    assert.exists(body.data?.token, 'complete debe emitir un access token')
    assert.exists(body.data?.refreshToken, 'complete debe emitir un refresh token')

    const newUserId = Number(body.data.user.userId)
    createdUserId = newUserId
    createdPersonId = Number(body.data.user.personId)

    const persistedUser = await User.query().where('user_id', newUserId).firstOrFail()
    const role = await Role.query().where('role_id', persistedUser.roleId).firstOrFail()

    const attachedBusinessUnits = await persistedUser
      .related('businessUnits')
      .query()
      .select('business_units.business_unit_id')
    assert.lengthOf(attachedBusinessUnits, 1, 'El usuario debe quedar asociado a su propia empresa')
    createdBusinessUnitId = attachedBusinessUnits[0].businessUnitId

    assert.equal(role.roleSlug, 'owner', 'El usuario creado por self-service debe nacer con rol owner')
    assert.notEqual(persistedUser.roleId, 1, 'No debe quedar con el roleId interno hardcodeado (1)')

    const draftAfterComplete = await SignupDraft.query()
      .where('signup_draft_id', signupDraftId)
      .first()
    assert.isNull(draftAfterComplete, 'El draft debe eliminarse tras completar el registro')
  })
})
