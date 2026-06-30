import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

type DomainSeed = {
  code: string
  nameKey: string
  categoryCode: string
  ord: number
  questionCodes: string[]
}

/**
 * PENDIENTE confirmación STPS:
 * - Mapeo pregunta -> dominio basado en propuesta inicial del equipo.
 * - Validar contra el texto oficial DOF antes de liberar CA-2.
 */
export default class extends BaseSeeder {
  async run() {
    const questionnaire = await RegulationQuestionnaire.findByOrFail(
      'regulationQuestionnaireCode',
      'GUIA-III-NOM035'
    )

    const now = DateTime.utc().toSQL({ includeOffset: false })!

    const domains: DomainSeed[] = [
      {
        code: 'AMBIENTE_CONDICIONES',
        nameKey: 'nom035.risk_domains.ambiente_condiciones',
        categoryCode: 'CAT-I',
        ord: 1,
        questionCodes: ['P01', 'P02', 'P03', 'P04', 'P05'],
      },
      {
        code: 'CARGA_TRABAJO',
        nameKey: 'nom035.risk_domains.carga_trabajo',
        categoryCode: 'CAT-II',
        ord: 2,
        questionCodes: [
          'P06',
          'P07',
          'P08',
          'P09',
          'P10',
          'P11',
          'P12',
          'P13',
          'P14',
          'P15',
          'P16',
          'P65',
          'P66',
          'P67',
          'P68',
        ],
      },
      {
        code: 'FALTA_CONTROL',
        nameKey: 'nom035.risk_domains.falta_control',
        categoryCode: 'CAT-II',
        ord: 3,
        questionCodes: ['P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P35', 'P36'],
      },
      {
        code: 'JORNADA_TRABAJO',
        nameKey: 'nom035.risk_domains.jornada_trabajo',
        categoryCode: 'CAT-III',
        ord: 4,
        questionCodes: ['P17', 'P18'],
      },
      {
        code: 'INTERFERENCIA_TRABAJO_FAMILIA',
        nameKey: 'nom035.risk_domains.interferencia_trabajo_familia',
        categoryCode: 'CAT-III',
        ord: 5,
        questionCodes: ['P19', 'P20', 'P21', 'P22'],
      },
      {
        code: 'LIDERAZGO',
        nameKey: 'nom035.risk_domains.liderazgo',
        categoryCode: 'CAT-IV',
        ord: 6,
        questionCodes: ['P31', 'P32', 'P33', 'P34', 'P37', 'P38', 'P39', 'P40', 'P41'],
      },
      {
        code: 'RELACIONES_TRABAJO',
        nameKey: 'nom035.risk_domains.relaciones_trabajo',
        categoryCode: 'CAT-IV',
        ord: 7,
        questionCodes: ['P42', 'P43', 'P44', 'P45', 'P46', 'P69', 'P70', 'P71', 'P72'],
      },
      {
        code: 'VIOLENCIA_LABORAL',
        nameKey: 'nom035.risk_domains.violencia_laboral',
        categoryCode: 'CAT-IV',
        ord: 8,
        questionCodes: ['P57', 'P58', 'P59', 'P60', 'P61', 'P62', 'P63', 'P64'],
      },
      {
        code: 'RECONOCIMIENTO_DESEMPENO',
        nameKey: 'nom035.risk_domains.reconocimiento_desempeno',
        categoryCode: 'CAT-V',
        ord: 9,
        questionCodes: ['P47', 'P48', 'P49', 'P50', 'P51', 'P52'],
      },
      {
        code: 'INSUFICIENTE_SENTIDO_PERTENENCIA',
        nameKey: 'nom035.risk_domains.insuficiente_sentido_pertenencia',
        categoryCode: 'CAT-V',
        ord: 10,
        questionCodes: ['P53', 'P54', 'P55', 'P56'],
      },
    ]

    const sections = await db
      .from('regulation_questionnaire_sections')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .select('regulation_questionnaire_section_id', 'regulation_questionnaire_section_code')

    const sectionById = new Map<number, string>()
    for (const section of sections) {
      sectionById.set(
        Number(section.regulation_questionnaire_section_id),
        String(section.regulation_questionnaire_section_code)
      )
    }

    const questions = await db
      .from('regulation_questionnaire_questions')
      .whereIn(
        'regulation_questionnaire_section_id',
        sections.map((section) => Number(section.regulation_questionnaire_section_id))
      )
      .select(
        'regulation_questionnaire_question_id',
        'regulation_questionnaire_question_code',
        'regulation_questionnaire_section_id'
      )

    const questionIdByCode = new Map<string, number>()
    const categoryQuestionCodes = new Map<string, Set<string>>()

    for (const question of questions) {
      const questionCode = String(question.regulation_questionnaire_question_code)
      const sectionId = Number(question.regulation_questionnaire_section_id)
      const categoryCode = sectionById.get(sectionId)
      if (!categoryCode) continue

      questionIdByCode.set(questionCode, Number(question.regulation_questionnaire_question_id))
      if (!categoryQuestionCodes.has(categoryCode)) {
        categoryQuestionCodes.set(categoryCode, new Set<string>())
      }
      categoryQuestionCodes.get(categoryCode)!.add(questionCode)
    }

    const domainQuestionCodes = new Map<string, Set<string>>()
    for (const domain of domains) {
      if (!domainQuestionCodes.has(domain.categoryCode)) {
        domainQuestionCodes.set(domain.categoryCode, new Set<string>())
      }
      for (const code of domain.questionCodes) {
        domainQuestionCodes.get(domain.categoryCode)!.add(code)
      }
    }

    for (const [categoryCode, categoryCodesSet] of categoryQuestionCodes.entries()) {
      const domainCodesSet = domainQuestionCodes.get(categoryCode) ?? new Set<string>()
      const missingFromDomain = [...categoryCodesSet].filter((code) => !domainCodesSet.has(code))
      const extraInDomain = [...domainCodesSet].filter((code) => !categoryCodesSet.has(code))

      if (missingFromDomain.length > 0 || extraInDomain.length > 0) {
        throw new Error(
          `Mapeo inválido para ${categoryCode}. Faltan: [${missingFromDomain.join(',')}], Sobran: [${extraInDomain.join(',')}]`
        )
      }
    }

    await db.transaction(async (trx) => {
      const currentDomainIds = await trx
        .from('risk_domains')
        .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
        .select('risk_domain_id')

      if (currentDomainIds.length > 0) {
        await trx
          .from('risk_domain_questions')
          .whereIn(
            'risk_domain_id',
            currentDomainIds.map((row) => Number(row.risk_domain_id))
          )
          .delete()
      }

      await trx
        .from('risk_domains')
        .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
        .delete()

      for (const domain of domains) {
        const insertedDomainId = await trx.table('risk_domains').insert({
          regulation_questionnaire_id: questionnaire.regulationQuestionnaireId,
          risk_domain_code: domain.code,
          risk_domain_name_key: domain.nameKey,
          risk_domain_category_section_code: domain.categoryCode,
          risk_domain_ord: domain.ord,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })

        const domainId = Number(insertedDomainId[0])
        const mappingRows = domain.questionCodes.map((questionCode) => {
          const questionId = questionIdByCode.get(questionCode)
          if (!questionId) {
            throw new Error(`No se encontró la pregunta ${questionCode} para mapeo de dominios`)
          }

          return {
            risk_domain_id: domainId,
            regulation_questionnaire_question_id: questionId,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          }
        })

        await trx.table('risk_domain_questions').insert(mappingRows)
      }
    })
  }
}
