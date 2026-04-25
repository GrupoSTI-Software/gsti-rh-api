import vine from '@vinejs/vine'

export const createCareerPathCandidateValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    employeeId: vine.number().min(1),
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
    careerPathCandidateIsOverride: vine.boolean(),
    careerPathOverrideReasonId: vine.number().min(0),
    careerPathCandidateJustification: vine.string().optional(),
    careerPathCandidateStatus: vine.string(),
    proposedBy: vine.number().min(0),
    reviewedBy: vine.number().min(0),
    careerPathCandidateReviewedAt: vine.date().optional(),
    careerPathCandidateRejectionReason: vine.string().optional(),
    careerPathCandidateActivatedAt: vine.date().optional(),
    careerPathCandidateExpiresAt: vine.date().optional(),
  })
)

export const updateCareerPathCandidateValidator = vine.compile(
  vine.object({
    careerPathCandidateStatus: vine.string(),
    careerPathCandidateRejectionReason: vine.string(),
  })
)
