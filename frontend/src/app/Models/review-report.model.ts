/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

export type ReviewReportReason = 'spam' | 'abusive_content' | 'personal_information' | 'inappropriate_content'
export type ReviewReportStatus = 'open' | 'resolved' | 'rejected'

export const REVIEW_REPORT_REASONS: ReviewReportReason[] = ['spam', 'abusive_content', 'personal_information', 'inappropriate_content']
export const REVIEW_REPORT_STATUSES: ReviewReportStatus[] = ['open', 'resolved', 'rejected']

export interface ReviewReport {
  id: number
  reviewId: string
  reason: ReviewReportReason
  status: ReviewReportStatus
  reporter: { id: number, email: string } | null
  resolver: { id: number, email: string } | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  review: { product: number, author: string, message: string } | null
}

export interface ReviewReportList {
  scope: 'all' | 'own'
  data: ReviewReport[]
}
