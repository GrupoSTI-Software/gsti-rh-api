import vine from '@vinejs/vine'

export const createCareerPathCandidateValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    employeeId: vine.number().min(1),
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
    careerPathCandidateIsOverride: vine.boolean(),
    careerPathOverrideReasonId: vine.number().min(1),
    careerPathCandidateJustification: vine.string(),
    careerPathCandidateStatus: vine.string(),
    proposedBy: vine.number().min(1),
    reviewedBy: vine.number().min(1),
    careerPathCandidateReviewedAt: vine.date(),
    careerPathCandidateRejectionReason: vine.string(),
    careerPathCandidateActivatedAt: vine.date(),
    careerPathCandidateExpiresAt: vine.date(),
  })
)

export const updateCareerPathCandidateValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    employeeId: vine.number().min(1),
    originPositionId: vine.number().min(1),
    targetPositionId: vine.number().min(1),
    careerPathCandidateIsOverride: vine.boolean(),
    careerPathOverrideReasonId: vine.number().min(1),
    careerPathCandidateJustification: vine.string(),
    careerPathCandidateStatus: vine.string(),
    proposedBy: vine.number().min(1),
    reviewedBy: vine.number().min(1),
    careerPathCandidateReviewedAt: vine.date(),
    careerPathCandidateRejectionReason: vine.string(),
    careerPathCandidateActivatedAt: vine.date(),
    careerPathCandidateExpiresAt: vine.date(),
  })
)
