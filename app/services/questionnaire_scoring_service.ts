import type {
  AggregationFn,
  CategoryResult,
  DomainResult,
  EmployeeResult,
  QuestionDefinitionInput,
  RiskLevel,
  ScoringInput,
  TabulationResult,
  ThresholdInput,
} from '../interfaces/questionnaire_tabulation.interface.js'
import { RISK_SEVERITY_ORD } from '../helpers/risk_severity.js'
import type { Nom035TabulationErrorCode } from '../constants/nom035_tabulation_error_codes.js'

export class QuestionnaireScoringServiceError extends Error {
  readonly errorCode: Nom035TabulationErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: Nom035TabulationErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'QuestionnaireScoringServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

type DomainMeta = {
  code: string
  categoryCode: string
}

export default class QuestionnaireScoringService {
  compute(input: ScoringInput): TabulationResult {
    const aggregationFn = input.aggregationFn ?? this.sumAggregation
    const respondersCount = input.responses.length
    const questionMap = this.buildQuestionMap(input.questionDefinitions)

    const employeeResultById = new Map<number, EmployeeResult>()
    const categoryValuesMap = new Map<string, number[]>()
    const domainValuesMap = new Map<string, number[]>()
    const domainMetaMap = new Map<string, DomainMeta>()
    const overallValues: number[] = []

    for (const response of input.responses) {
      const employeeValues: number[] = []

      for (const answer of response.answers) {
        const question = questionMap.get(answer.questionId)
        if (!question) {
          continue
        }

        const option = question.optionsMap.get(answer.optionKey)
        if (!option) {
          throw new QuestionnaireScoringServiceError(
            `Option key inválido para pregunta ${answer.questionId}: ${answer.optionKey}`,
            'NOM035.TAB.INVALID_ANSWER_OPTION',
            409
          )
        }

        const baseValue =
          question.isReverseScored === 1 ? (option.reverseValue ?? option.value) : option.value
        const finalValue = this.roundTo2(baseValue * question.weight)

        overallValues.push(finalValue)
        employeeValues.push(finalValue)

        if (!categoryValuesMap.has(question.categoryCode)) {
          categoryValuesMap.set(question.categoryCode, [])
        }
        categoryValuesMap.get(question.categoryCode)!.push(finalValue)

        if (question.domainCode) {
          if (!domainValuesMap.has(question.domainCode)) {
            domainValuesMap.set(question.domainCode, [])
          }
          domainValuesMap.get(question.domainCode)!.push(finalValue)
          domainMetaMap.set(question.domainCode, {
            code: question.domainCode,
            categoryCode: question.categoryCode,
          })
        }
      }

      const employeeScore = this.roundTo2(aggregationFn(employeeValues))
      employeeResultById.set(response.employeeId, {
        employeeId: response.employeeId,
        score: employeeScore,
        riskLevel: this.classifyRisk(employeeScore, input.thresholds, 'overall', null),
      })
    }

    const categories = this.buildCategories(
      categoryValuesMap,
      input.thresholds,
      respondersCount,
      aggregationFn
    )
    const domains = this.buildDomains(
      domainValuesMap,
      domainMetaMap,
      input.thresholds,
      respondersCount,
      aggregationFn
    )

    const overallScore = this.roundTo2(aggregationFn(overallValues))

    return {
      applicationId: input.applicationId,
      instrumentCode: input.instrumentCode,
      respondersCount,
      overall: {
        score: overallScore,
        riskLevel: this.classifyRisk(overallScore, input.thresholds, 'overall', null),
      },
      categories,
      domains,
      employees: [...employeeResultById.values()].sort((a, b) => a.employeeId - b.employeeId),
    }
  }

  private buildQuestionMap(questionDefinitions: QuestionDefinitionInput[]) {
    const map = new Map<
      number,
      {
        categoryCode: string
        domainCode: string | null
        isReverseScored: number
        weight: number
        optionsMap: Map<string, { key: string; value: number; reverseValue?: number }>
      }
    >()

    for (const question of questionDefinitions) {
      map.set(question.questionId, {
        categoryCode: question.categoryCode,
        domainCode: question.domainCode,
        isReverseScored: question.isReverseScored,
        weight: question.weight,
        optionsMap: new Map(question.options.map((option) => [option.key, option])),
      })
    }

    return map
  }

  private buildCategories(
    categoryValuesMap: Map<string, number[]>,
    thresholds: ThresholdInput[],
    respondersCount: number,
    aggregationFn: AggregationFn
  ): CategoryResult[] {
    return [...categoryValuesMap.entries()]
      .map(([code, values]) => {
        const score = this.roundTo2(aggregationFn(values))
        return {
          code,
          score,
          riskLevel: this.classifyRisk(score, thresholds, 'category', code),
          respondersCount,
        }
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }

  private buildDomains(
    domainValuesMap: Map<string, number[]>,
    domainMetaMap: Map<string, DomainMeta>,
    thresholds: ThresholdInput[],
    respondersCount: number,
    aggregationFn: AggregationFn
  ): DomainResult[] {
    return [...domainValuesMap.entries()]
      .map(([code, values]) => {
        const score = this.roundTo2(aggregationFn(values))
        const meta = domainMetaMap.get(code)
        return {
          code,
          categoryCode: meta?.categoryCode ?? 'SIN_CATEGORIA',
          score,
          riskLevel: this.classifyRisk(score, thresholds, 'domain', code),
          respondersCount,
        }
      })
      .sort((a, b) => this.sortByRiskSeverity(a.riskLevel, b.riskLevel))
  }

  private classifyRisk(
    score: number,
    thresholds: ThresholdInput[],
    scope: ThresholdInput['scope'],
    targetCode: string | null
  ): RiskLevel | null {
    const row = thresholds.find((threshold) => {
      const sameTarget = threshold.scope === 'overall' ? true : threshold.targetCode === targetCode
      return (
        threshold.scope === scope && sameTarget && score >= threshold.min && score <= threshold.max
      )
    })

    return row?.level ?? null
  }

  private sortByRiskSeverity(left: RiskLevel | null, right: RiskLevel | null): number {
    const leftSeverity = left ? RISK_SEVERITY_ORD[left] : 0
    const rightSeverity = right ? RISK_SEVERITY_ORD[right] : 0
    return rightSeverity - leftSeverity
  }

  private sumAggregation(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0)
  }

  private roundTo2(value: number): number {
    return Number(value.toFixed(2))
  }
}
