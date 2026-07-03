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
 * Semilla idempotente: Guía de Referencia II de NOM-035-STPS-2018.
 * Instrumento para centros de trabajo de 16 a 50 trabajadores.
 *
 * Total: 46 ítems (DOF 23/10/2018 — Tabla 2 y Tabla 3 de la Guía II).
 *
 * Ítems con puntaje directo (Siempre=4): 1–17, 34–46
 * Ítems con puntaje invertido (Siempre=0): 18–33
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
        regulationQuestionnaireCode: 'GUIA-II-NOM035',
        regulationQuestionnaireVersion: '2018',
      },
      {
        regulationQuestionnaireTitleKey: 'regulatory.questionnaires.guia_ii_nom035_2018.title',
        regulationQuestionnaireDescriptionKey:
          'regulatory.questionnaires.guia_ii_nom035_2018.description',
        regulationQuestionnaireStatus: 'vigente',
        regulationQuestionnaireAppliesToDescriptionKey:
          'regulatory.questionnaires.guia_ii_nom035_2018.applies_to',
        regulationQuestionnaireMinResponders: 16,
        regulationQuestionnaireCompletionTimeMinutes: 20,
      }
    )

    const qid = questionnaire.regulationQuestionnaireId

    // 3. Vincular a cláusula 8.1 de NOM-035 (identificación y análisis)
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

    // 4. Secciones y preguntas según Tabla 3 oficial (DOF 23/10/2018)
    //
    // Categoría I  — Ambiente de trabajo (3 ítems)
    // Categoría II — Factores propios de la actividad (20 ítems)
    // Categoría III — Organización del tiempo de trabajo (4 ítems)
    // Categoría IV — Liderazgo y relaciones en el trabajo (19 ítems)
    //                Total: 46 ítems ✓
    const sections = [
      {
        code: 'CAT-I',
        ord: 1,
        titleKey: 'regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_i.title',
        // Cond. en el ambiente de trabajo: inseguras (2), insalubres (1), peligrosas (3)
        questions: [1, 2, 3],
      },
      {
        code: 'CAT-II',
        ord: 2,
        titleKey: 'regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_ii.title',
        // Carga de trabajo: 4,5,6,7,8,9,10,11,12,13,41,42,43
        // Falta de control: 18,19,20,21,22,26,27
        questions: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18, 19, 20, 21, 22, 26, 27, 41, 42, 43],
      },
      {
        code: 'CAT-III',
        ord: 3,
        titleKey: 'regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_iii.title',
        // Jornada extensas: 14,15 / Interferencia trabajo-familia: 16,17
        questions: [14, 15, 16, 17],
      },
      {
        code: 'CAT-IV',
        ord: 4,
        titleKey: 'regulatory.questionnaires.guia_ii_nom035_2018.sections.cat_iv.title',
        // Liderazgo: 23,24,25,28,29 / Relaciones: 30,31,32,33 / Violencia: 34–40
        // Relación con supervisados (solo aplica a jefes): 44,45,46
        questions: [23, 24, 25, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 44, 45, 46],
      },
    ]

    // Ítems con puntaje invertido (Siempre=0 ... Nunca=4) según Tabla 2 oficial
    const reverseScored = new Set([18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33])

    // Upsert por código para preservar los IDs: hay FKs con RESTRICT hacia las
    // preguntas (questionnaire_application_answers), por lo que borrar y
    // reinsertar bloquearía el seed y rompería respuestas históricas.
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
            regulationQuestionnaireQuestionTextKey: `regulatory.questionnaires.guia_ii_nom035_2018.questions.${qCode.toLowerCase()}.text`,
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
