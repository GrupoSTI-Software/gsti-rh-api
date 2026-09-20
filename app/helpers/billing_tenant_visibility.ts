import type { MySubscriptionResult } from '#services/billing_tenant_service'

/**
 * Lo que ve de la suscripción quien NO es dueño de la cuenta.
 *
 * `subscription` se reduce a un marcador de presencia: dice que la empresa tiene
 * contratación viva, y nada sobre plan, importes, periodo ni cambios en curso.
 */
export interface MySubscriptionRestrictedResult {
  businessUnitOrigin: MySubscriptionResult['businessUnitOrigin']
  subscription: { hasLiveSubscription: true } | null
  /** Siempre `null`: la contratacion renovable lleva importes y es del dueño. */
  renewal: null
  /** El estado de la cuenta sí viaja: es un aviso, no un dato de cobro. */
  accountStatus: MySubscriptionResult['accountStatus']
  minimumContractedEmployees: number | null
}

/**
 * Recorta la suscripción a lo que cualquier cuenta de la empresa puede saber.
 *
 * Por qué existe en vez de un 403: el backoffice corre un middleware GLOBAL y
 * fail-closed (`middleware/billing-subscription.global.ts` en valanserh-bo) que
 * consulta esta ruta en CADA navegación de CUALQUIER usuario autenticado para
 * detener a las empresas self-service sin contratación viva. Negarle la lectura
 * a quien no es dueño dejaría a todo administrador y colaborador atrapado en la
 * pantalla de "suscripción requerida", con el backoffice inservible.
 *
 * Ese middleware solo necesita tres datos —el origen de la empresa, si hay
 * suscripción viva y el mínimo contratable—, y ninguno es información de
 * dinero: que la empresa donde trabajas tiene su cuenta al corriente no es un
 * secreto. El plan contratado, los importes y los cambios en curso sí lo son, y
 * esos se quedan del lado del dueño.
 */
export function restrictMySubscription(
  result: MySubscriptionResult
): MySubscriptionRestrictedResult {
  return {
    businessUnitOrigin: result.businessUnitOrigin,
    subscription: result.subscription ? { hasLiveSubscription: true } : null,
    renewal: null,
    accountStatus: result.accountStatus,
    minimumContractedEmployees: result.minimumContractedEmployees,
  }
}
