/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import crypto from 'node:crypto'
import { type Request, type Response, type NextFunction } from 'express'
import { UniqueConstraintError, type WhereOptions } from 'sequelize'

import {
  ReviewReportModel,
  reviewReportReasons,
  reviewReportStatuses,
  type ReviewReportReason,
  type ReviewReportStatus
} from '../models/reviewReport'
import { UserModel } from '../models/user'
import * as db from '../data/mongodb'
import * as security from '../lib/insecurity'
import * as utils from '../lib/utils'

export interface ReviewReportActor {
  id: number
  email: string
  role: string
}

const reviewIdPattern = /^[A-Za-z0-9]{1,64}$/

export const isValidReviewId = (reviewId: unknown): reviewId is string =>
  typeof reviewId === 'string' && reviewIdPattern.test(reviewId)

export const isReviewReportReason = (reason: unknown): reason is ReviewReportReason =>
  typeof reason === 'string' && (reviewReportReasons as readonly string[]).includes(reason)

export const isReviewReportStatus = (status: unknown): status is ReviewReportStatus =>
  typeof status === 'string' && (reviewReportStatuses as readonly string[]).includes(status)

const decodeSegment = (segment: string) => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))

// Strict RS256-only verification, independent of the (intentionally vulnerable) JWT libraries used elsewhere.
export function verifyRs256Token (token: unknown, publicKey: string = security.publicKey, now: number = Date.now()): Record<string, any> | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  try {
    const header = decodeSegment(encodedHeader)
    if (header?.alg !== 'RS256') return null
    const signature = Buffer.from(encodedSignature, 'base64url')
    if (signature.length === 0) return null
    const isValid = crypto.verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, signature)
    if (!isValid) return null
    const payload = decodeSegment(encodedPayload)
    if (typeof payload?.exp === 'number' && payload.exp * 1000 <= now) return null
    return payload
  } catch {
    return null
  }
}

const actorFrom = (res: Response): ReviewReportActor => res.locals.reviewReportActor

export function requireReviewReportUser () {
  return async (req: Request, res: Response, next: NextFunction) => {
    const payload = verifyRs256Token(utils.jwtFrom(req))
    const userId = payload?.data?.id
    if (!Number.isInteger(userId)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const user = await UserModel.findByPk(userId)
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.locals.reviewReportActor = { id: user.id, email: user.email, role: user.role }
    next()
  }
}

export function requireReviewReportAdmin () {
  return (req: Request, res: Response, next: NextFunction) => {
    if (actorFrom(res)?.role !== security.roles.admin) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

const userSummary = (user?: UserModel | null) => user ? { id: user.id, email: user.email } : null

async function findReview (reviewId: string) {
  return await db.reviewsCollection.findOne({ _id: reviewId })
}

async function serialize (report: ReviewReportModel & { Reporter?: UserModel | null, Resolver?: UserModel | null }, reviewCache = new Map<string, any>()) {
  if (!reviewCache.has(report.reviewId)) {
    reviewCache.set(report.reviewId, await findReview(report.reviewId))
  }
  const review = reviewCache.get(report.reviewId)
  return {
    id: report.id,
    reviewId: report.reviewId,
    reason: report.reason,
    status: report.status,
    reporter: userSummary(report.Reporter),
    resolver: userSummary(report.Resolver),
    resolvedAt: report.resolvedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    review: review ? { product: review.product, author: review.author, message: review.message } : null
  }
}

const includeUsers = [
  { model: UserModel, as: 'Reporter', attributes: ['id', 'email'] },
  { model: UserModel, as: 'Resolver', attributes: ['id', 'email'] }
]

async function loadReport (id: number) {
  return await ReviewReportModel.findByPk(id, { include: includeUsers })
}

export function createReviewReport () {
  return async (req: Request, res: Response) => {
    const actor = actorFrom(res)
    const body = req.body !== null && typeof req.body === 'object' ? req.body : {}
    const { reviewId, reason } = body

    if (!isValidReviewId(reviewId)) {
      return res.status(400).json({ error: 'Invalid review id' })
    }
    if (!isReviewReportReason(reason)) {
      return res.status(400).json({ error: 'Invalid reason', allowed: reviewReportReasons })
    }

    try {
      if (!await findReview(reviewId)) {
        return res.status(404).json({ error: 'Review not found' })
      }
      if (await ReviewReportModel.findOne({ where: { ReporterId: actor.id, reviewId } })) {
        return res.status(409).json({ error: 'Review already reported' })
      }
      const created = await ReviewReportModel.create({ ReporterId: actor.id, reviewId, reason })
      const report = await loadReport(created.id)
      return res.status(201).json({ status: 'success', data: await serialize(report!) })
    } catch (err: unknown) {
      if (err instanceof UniqueConstraintError) {
        return res.status(409).json({ error: 'Review already reported' })
      }
      return res.status(500).json({ error: 'Could not create review report' })
    }
  }
}

export function listReviewReports () {
  return async (req: Request, res: Response) => {
    const actor = actorFrom(res)
    const isAdmin = actor.role === security.roles.admin
    const where: WhereOptions<ReviewReportModel> = isAdmin ? {} : { ReporterId: actor.id }

    const status = req.query.status
    if (status !== undefined) {
      if (!isReviewReportStatus(status)) {
        return res.status(400).json({ error: 'Invalid status', allowed: reviewReportStatuses })
      }
      Object.assign(where, { status })
    }

    try {
      const reports = await ReviewReportModel.findAll({ where, include: includeUsers, order: [['createdAt', 'DESC'], ['id', 'DESC']] })
      const reviewCache = new Map<string, any>()
      const data = []
      for (const report of reports) {
        data.push(await serialize(report, reviewCache))
      }
      return res.json({ status: 'success', scope: isAdmin ? 'all' : 'own', data })
    } catch {
      return res.status(500).json({ error: 'Could not retrieve review reports' })
    }
  }
}

export function updateReviewReportStatus () {
  return async (req: Request, res: Response) => {
    const actor = actorFrom(res)
    const id = Number(req.params.id)
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid report id' })
    }
    const status = req.body !== null && typeof req.body === 'object' ? req.body.status : undefined
    if (!isReviewReportStatus(status)) {
      return res.status(400).json({ error: 'Invalid status', allowed: reviewReportStatuses })
    }

    try {
      const report = await ReviewReportModel.findByPk(id)
      if (!report) {
        return res.status(404).json({ error: 'Review report not found' })
      }
      report.status = status
      report.ResolverId = actor.id
      report.resolvedAt = status === 'open' ? null : new Date()
      await report.save()
      const updated = await loadReport(id)
      return res.json({ status: 'success', data: await serialize(updated!) })
    } catch {
      return res.status(500).json({ error: 'Could not update review report' })
    }
  }
}
