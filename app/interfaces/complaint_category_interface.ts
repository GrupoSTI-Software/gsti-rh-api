export interface ComplaintCategoryCatalogItem {
  complaintCategoryId: number
  complaintCategorySlug: string
  complaintCategoryLabel: string
}

export interface ComplaintCategoryListResult {
  complaintCategories: ComplaintCategoryCatalogItem[]
}
