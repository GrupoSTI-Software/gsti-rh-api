import vine from '@vinejs/vine'
import { TELEWORK_CHECKLIST_ANSWER_RESULT } from '#constants/telework_checklist'

/**
 * Validador de la visita de la Comisión (VLRH-H1790812613870, `POST
 * /api/nom037/telework-checklists`).
 *
 * Valida la forma del body; las reglas de negocio (cobertura exacta de puntos,
 * fecha no futura, visitador presente, lugar vivo) las decide el servicio y
 * salen con su propio `key`/`code`. `inspectorName` es opcional en el esquema:
 * su ausencia es `TWC.VAL.006` (`visitador-requerido`), no `TWC.VAL.001`.
 * `mode` y los campos ajenos al esquema no se declaran: Vine descarta las
 * llaves extra (CA-7/CA-8).
 */
const ANSWER_RESULTS = [
  TELEWORK_CHECKLIST_ANSWER_RESULT.COMPLIANT,
  TELEWORK_CHECKLIST_ANSWER_RESULT.NON_COMPLIANT,
  TELEWORK_CHECKLIST_ANSWER_RESULT.NOT_APPLICABLE,
] as const

export const teleworkChecklistCreateValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1).withoutDecimals(),
    appliedAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    inspectorName: vine.string().trim().maxLength(150).optional(),
    teleworkLocationId: vine.number().min(1).withoutDecimals().optional(),
    notes: vine.string().trim().maxLength(2000).optional(),
    answers: vine
      .array(
        vine.object({
          itemId: vine.number().min(1).withoutDecimals(),
          result: vine.enum([...ANSWER_RESULTS]),
          observation: vine.string().trim().maxLength(1000).optional(),
        })
      )
      .minLength(1),
  })
)

/** Entrada ya validada y normalizada por Vine (la consume `registerVisit`). */
export type TeleworkChecklistCreateInput = Awaited<
  ReturnType<typeof teleworkChecklistCreateValidator.validate>
>
