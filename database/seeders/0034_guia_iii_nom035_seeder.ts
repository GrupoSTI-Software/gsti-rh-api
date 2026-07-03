import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import RegulationQuestionnaireAnswerScale from '#models/regulation_questionnaire_answer_scale'
import RegulationQuestionnaireQuestion from '#models/regulation_questionnaire_question'
import RegulationQuestionnaireSection from '#models/regulation_questionnaire_section'
import RegulatoryAuthority from '#models/regulatory_authority'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

type QuestionSeedValues = {
  regulationQuestionnaireQuestionTextKey: string
  regulationQuestionnaireQuestionHelpKey: string | null
  regulationQuestionnaireQuestionAnswerScaleId: number
  regulationQuestionnaireQuestionIsReverseScored: number
  regulationQuestionnaireQuestionWeight: number
  regulationQuestionnaireQuestionOrd: number
}

/**
 * Semilla idempotente: Guía de Referencia III de NOM-035-STPS-2018.
 * Instrumento para centros de trabajo con más de 50 trabajadores.
 *
 * Total: 72 ítems (DOF 23/10/2018 — Tabla 5 y Tabla 6 de la Guía III).
 *
 * Ítems con puntaje directo (Siempre=4): 2,3,5–22,29,54,58–72
 * Ítems con puntaje invertido (Siempre=0): 1,4,23–28,30–53,55–57
 */
export default class extends BaseSeeder {
  async run() {
    // 1. Obtener dependencias
    const stps = await RegulatoryAuthority.findByOrFail('regulatoryAuthoritySlug', 'stps')
    const regulation = await Regulation.query()
      .where('regulationCode', 'NOM-035-STPS')
      .where('regulationVersion', '2018')
      .firstOrFail()

    const scale = await RegulationQuestionnaireAnswerScale.findByOrFail(
      'regulationQuestionnaireAnswerScaleCode',
      'LIKERT_FREQ_5'
    )

    // 2. Crear / actualizar cuestionario
    const questionnaire = await RegulationQuestionnaire.updateOrCreate(
      {
        regulatoryAuthorityId: stps.regulatoryAuthorityId,
        regulationQuestionnaireCode: 'GUIA-III-NOM035',
        regulationQuestionnaireVersion: '2018',
      },
      {
        regulationQuestionnaireTitleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.title',
        regulationQuestionnaireDescriptionKey:
          'regulatory.questionnaires.guia_iii_nom035_2018.description',
        regulationQuestionnaireStatus: 'vigente',
        regulationQuestionnaireAppliesToDescriptionKey:
          'regulatory.questionnaires.guia_iii_nom035_2018.applies_to',
        regulationQuestionnaireMinResponders: 51,
        regulationQuestionnaireCompletionTimeMinutes: 30,
      }
    )

    const qid = questionnaire.regulationQuestionnaireId

    // 3. Vincular a cláusula 8.1 de NOM-035 (identificación, análisis y entorno)
    const clause81 = await RegulationClause.query()
      .where('regulationId', regulation.regulationId)
      .where('regulationClauseCode', '8.1')
      .firstOrFail()

    await questionnaire.related('clauses').sync({
      [clause81.regulationClauseId]: {
        created_at: DateTime.now().toSQL({ includeOffset: false }),
        updated_at: DateTime.now().toSQL({ includeOffset: false }),
      },
    })

    // 4. Secciones y preguntas según Tabla 6 oficial (DOF 23/10/2018)
    //
    // Categoría I   — Ambiente de trabajo (5 ítems)
    // Categoría II  — Factores propios de la actividad (25 ítems)
    // Categoría III — Organización del tiempo de trabajo (6 ítems)
    // Categoría IV  — Liderazgo y relaciones en el trabajo (26 ítems)
    // Categoría V   — Entorno organizacional (10 ítems)
    //                  Total: 72 ítems ✓
    const sections = [
      {
        code: 'CAT-I',
        ord: 1,
        titleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.sections.cat_i.title',
        // Cond. peligrosas: 1,3 / Cond. insalubres: 2,4 / Trabajos peligrosos: 5
        questions: [1, 2, 3, 4, 5],
      },
      {
        code: 'CAT-II',
        ord: 2,
        titleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.sections.cat_ii.title',
        // Carga de trabajo: 6,7,8,9,10,11,12,13,14,15,16,65,66,67,68
        // Falta de control: 23,24,25,26,27,28,29,30,35,36
        questions: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 35, 36, 65, 66, 67, 68],
      },
      {
        code: 'CAT-III',
        ord: 3,
        titleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.sections.cat_iii.title',
        // Jornadas extensas: 17,18 / Fuera del trabajo: 19,20 / Resp. familiares: 21,22
        questions: [17, 18, 19, 20, 21, 22],
      },
      {
        code: 'CAT-IV',
        ord: 4,
        titleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.sections.cat_iv.title',
        // Liderazgo (claridad): 31,32,33,34 / Caract. liderazgo: 37,38,39,40,41
        // Relaciones sociales: 42,43,44,45,46 / Relación supervisados: 69,70,71,72
        // Violencia laboral: 57,58,59,60,61,62,63,64
        questions: [31, 32, 33, 34, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 57, 58, 59, 60, 61, 62, 63, 64, 69, 70, 71, 72],
      },
      {
        code: 'CAT-V',
        ord: 5,
        titleKey: 'regulatory.questionnaires.guia_iii_nom035_2018.sections.cat_v.title',
        // Reconocimiento del desempeño: 47,48,49,50,51,52
        // Sentido de pertenencia e inestabilidad: 53,54,55,56
        questions: [47, 48, 49, 50, 51, 52, 53, 54, 55, 56],
      },
    ]

    // Ítems con puntaje invertido (Siempre=0 ... Nunca=4) según Tabla 5 oficial
    const reverseScored = new Set([
      1, 4, 23, 24, 25, 26, 27, 28, 30,
      31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
      47, 48, 49, 50, 51, 52, 53, 55, 56, 57,
    ])

    // Upsert por código para preservar los IDs: hay FKs con RESTRICT hacia las
    // preguntas (risk_domain_questions, questionnaire_application_answers), por
    // lo que borrar y reinsertar está prohibido — bloquearía el seed y rompería
    // respuestas históricas.
    const keptSectionIds: number[] = []
    const keptQuestionIds: number[] = []

    for (const sectionData of sections) {
      const section = await this.upsertSection(qid, {
        code: sectionData.code,
        titleKey: sectionData.titleKey,
        ord: sectionData.ord,
      })
      keptSectionIds.push(section.regulationQuestionnaireSectionId)

      for (let i = 0; i < sectionData.questions.length; i++) {
        const qNum = sectionData.questions[i]
        const qCode = `P${qNum.toString().padStart(2, '0')}`
        const question = await this.upsertQuestion(
          section.regulationQuestionnaireSectionId,
          qCode,
          {
            regulationQuestionnaireQuestionTextKey: `regulatory.questionnaires.guia_iii_nom035_2018.questions.${qCode.toLowerCase()}.text`,
            regulationQuestionnaireQuestionHelpKey: null,
            regulationQuestionnaireQuestionAnswerScaleId: scale.regulationQuestionnaireAnswerScaleId,
            regulationQuestionnaireQuestionIsReverseScored: reverseScored.has(qNum) ? 1 : 0,
            regulationQuestionnaireQuestionWeight: 1,
            regulationQuestionnaireQuestionOrd: i + 1,
          }
        )
        keptQuestionIds.push(question.regulationQuestionnaireQuestionId)
      }
    }

    // 5. Retirar (soft delete) lo que ya no forme parte de la definición
    // oficial: las respuestas históricas conservan su pregunta y el instrumento
    // anterior sigue consultable con withTrashed.
    const now = DateTime.utc().toSQL({ includeOffset: false })
    await db
      .from('regulation_questionnaire_questions')
      .whereIn(
        'regulation_questionnaire_section_id',
        db
          .from('regulation_questionnaire_sections')
          .where('regulation_questionnaire_id', qid)
          .select('regulation_questionnaire_section_id')
      )
      .whereNotIn('regulation_questionnaire_question_id', keptQuestionIds)
      .whereNull('deleted_at')
      .update({ deleted_at: now, updated_at: now })
    await db
      .from('regulation_questionnaire_sections')
      .where('regulation_questionnaire_id', qid)
      .whereNotIn('regulation_questionnaire_section_id', keptSectionIds)
      .whereNull('deleted_at')
      .update({ deleted_at: now, updated_at: now })
  }

  /**
   * Upsert por clave natural incluyendo filas soft-borradas: el índice único
   * (cuestionario, código) las cuenta, pero el scope de SoftDeletes las oculta
   * de updateOrCreate — sin withTrashed, un ítem que regresa a la definición
   * intentaría un INSERT duplicado. Si existe retirada, se restaura.
   */
  private async upsertSection(
    qid: number,
    data: { code: string; titleKey: string; ord: number }
  ): Promise<RegulationQuestionnaireSection> {
    const existing = await RegulationQuestionnaireSection.query()
      .withTrashed()
      .where('regulationQuestionnaireId', qid)
      .where('regulationQuestionnaireSectionCode', data.code)
      .first()

    const values = {
      regulationQuestionnaireSectionTitleKey: data.titleKey,
      regulationQuestionnaireSectionOrd: data.ord,
      regulationQuestionnaireSectionDescriptionKey: null,
      deletedAt: null,
    }

    if (existing) {
      existing.merge(values)
      await existing.save()
      return existing
    }

    return RegulationQuestionnaireSection.create({
      regulationQuestionnaireId: qid,
      regulationQuestionnaireSectionCode: data.code,
      ...values,
    })
  }

  /**
   * Mismo upsert con restauración que upsertSection, para preguntas
   * (índice único: sección + código).
   */
  private async upsertQuestion(
    sectionId: number,
    qCode: string,
    values: QuestionSeedValues
  ): Promise<RegulationQuestionnaireQuestion> {
    const existing = await RegulationQuestionnaireQuestion.query()
      .withTrashed()
      .where('regulationQuestionnaireSectionId', sectionId)
      .where('regulationQuestionnaireQuestionCode', qCode)
      .first()

    if (existing) {
      existing.merge({ ...values, deletedAt: null })
      await existing.save()
      return existing
    }

    return RegulationQuestionnaireQuestion.create({
      regulationQuestionnaireSectionId: sectionId,
      regulationQuestionnaireQuestionCode: qCode,
      ...values,
      deletedAt: null,
    })
  }
}
