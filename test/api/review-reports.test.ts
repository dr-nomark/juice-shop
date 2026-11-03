/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import request from 'supertest'
import type { Express } from 'express'
import config from 'config'
import { createTestApp } from './helpers/setup'
import { login } from './helpers/auth'
import * as security from '../../lib/insecurity'

let app: Express
let adminAuth: { token: string, bid: number }
let jimAuth: { token: string, bid: number }
let benderAuth: { token: string, bid: number }
let reviewId: string
let otherReviewId: string

const domain = config.get<string>('application.domain')
const headers = (token?: string) => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' })
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

before(async () => {
  const result = await createTestApp()
  app = result.app
  adminAuth = await login(app, { email: `admin@${domain}`, password: 'admin123' })
  jimAuth = await login(app, { email: `jim@${domain}`, password: 'ncc-1701' })
  benderAuth = await login(app, { email: `bender@${domain}`, password: 'OhG0dPlease1nsertLiquor!' })
  const reviews = await request(app).get('/rest/products/1/reviews')
  reviewId = reviews.body.data[0]._id
  const otherReviews = await request(app).get('/rest/products/3/reviews')
  otherReviewId = otherReviews.body.data[0]._id
}, { timeout: 60000 })

void describe('POST /rest/review-reports', () => {
  void it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers())
      .send({ reviewId, reason: 'spam' })
    assert.equal(res.status, 401)
  })

  void it('rejects unsigned "none" algorithm tokens', async () => {
    const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ data: { id: 1, email: `admin@${domain}`, role: 'admin' } })}.`
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(token))
      .send({ reviewId, reason: 'spam' })
    assert.equal(res.status, 401)
  })

  void it('rejects HS256 tokens signed with the public key', async () => {
    const header = base64url({ alg: 'HS256', typ: 'JWT' })
    const payload = base64url({ data: { id: 1, email: `admin@${domain}`, role: 'admin' } })
    const signature = crypto.createHmac('sha256', security.publicKey).update(`${header}.${payload}`).digest('base64url')
    const res = await request(app)
      .get('/rest/review-reports')
      .set(headers(`${header}.${payload}.${signature}`))
    assert.equal(res.status, 401)
  })

  void it('rejects validly signed tokens for users that do not exist', async () => {
    const res = await request(app)
      .get('/rest/review-reports')
      .set(headers(security.authorize({ data: { id: 999999, email: 'ghost@juice-sh.op', role: 'admin' } })))
    assert.equal(res.status, 401)
  })

  void it('rejects reports without a supported reason', async () => {
    for (const reason of [undefined, 'other', 'SPAM', ['spam']]) {
      const res = await request(app)
        .post('/rest/review-reports')
        .set(headers(jimAuth.token))
        .send({ reviewId, reason })
      assert.equal(res.status, 400, `expected reason ${JSON.stringify(reason)} to be rejected`)
    }
  })

  void it('rejects malformed review ids including NoSQL operators', async () => {
    for (const id of [undefined, '', { $ne: null }, 'abc\' || true || \'']) {
      const res = await request(app)
        .post('/rest/review-reports')
        .set(headers(jimAuth.token))
        .send({ reviewId: id, reason: 'spam' })
      assert.equal(res.status, 400, `expected reviewId ${JSON.stringify(id)} to be rejected`)
    }
  })

  void it('responds with 404 for reviews that do not exist', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(jimAuth.token))
      .send({ reviewId: 'doesNotExist123', reason: 'spam' })
    assert.equal(res.status, 404)
  })

  void it('creates an open report owned by the authenticated user', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(jimAuth.token))
      .send({ reviewId, reason: 'abusive_content', ReporterId: 1, status: 'resolved', ResolverId: 1 })
    assert.equal(res.status, 201)
    const report = res.body.data
    assert.equal(report.reviewId, reviewId)
    assert.equal(report.reason, 'abusive_content')
    assert.equal(report.status, 'open')
    assert.equal(report.reporter.email, `jim@${domain}`)
    assert.equal(report.resolver, null)
    assert.equal(report.resolvedAt, null)
    assert.ok(report.createdAt)
    assert.ok(report.updatedAt)
    assert.equal(report.reporter.password, undefined)
  })

  void it('rejects duplicate reports of the same review by the same user', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(jimAuth.token))
      .send({ reviewId, reason: 'spam' })
    assert.equal(res.status, 409)
  })

  void it('allows other users to report the same review', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(benderAuth.token))
      .send({ reviewId, reason: 'personal_information' })
    assert.equal(res.status, 201)
    assert.equal(res.body.data.reporter.email, `bender@${domain}`)
  })

  void it('allows the same user to report a different review', async () => {
    const res = await request(app)
      .post('/rest/review-reports')
      .set(headers(benderAuth.token))
      .send({ reviewId: otherReviewId, reason: 'inappropriate_content' })
    assert.equal(res.status, 201)
  })
})

void describe('GET /rest/review-reports', () => {
  void it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/rest/review-reports')
    assert.equal(res.status, 401)
  })

  void it('returns only the own reports for regular users', async () => {
    const res = await request(app)
      .get('/rest/review-reports')
      .set(headers(jimAuth.token))
    assert.equal(res.status, 200)
    assert.equal(res.body.scope, 'own')
    assert.equal(res.body.data.length, 1)
    assert.ok(res.body.data.every((report: any) => report.reporter.email === `jim@${domain}`))
  })

  void it('returns all reports for administrators', async () => {
    const res = await request(app)
      .get('/rest/review-reports')
      .set(headers(adminAuth.token))
    assert.equal(res.status, 200)
    assert.equal(res.body.scope, 'all')
    const reporters = new Set(res.body.data.map((report: any) => report.reporter.email))
    assert.ok(reporters.has(`jim@${domain}`))
    assert.ok(reporters.has(`bender@${domain}`))
    assert.ok(res.body.data[0].review.message)
  })

  void it('filters by status and rejects unknown statuses', async () => {
    const open = await request(app)
      .get('/rest/review-reports?status=open')
      .set(headers(adminAuth.token))
    assert.equal(open.status, 200)
    assert.ok(open.body.data.every((report: any) => report.status === 'open'))

    const invalid = await request(app)
      .get('/rest/review-reports?status=closed')
      .set(headers(adminAuth.token))
    assert.equal(invalid.status, 400)
  })

  void it('is not exposed through the generic /api CRUD endpoints', async () => {
    const res = await request(app)
      .get('/api/ReviewReports')
      .set(headers(jimAuth.token))
    assert.notEqual(res.status, 200)
  })
})

void describe('PATCH /rest/review-reports/:id', () => {
  let jimReportId: number

  before(async () => {
    const res = await request(app)
      .get('/rest/review-reports')
      .set(headers(jimAuth.token))
    jimReportId = res.body.data[0].id
  })

  void it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers())
      .send({ status: 'resolved' })
    assert.equal(res.status, 401)
  })

  void it('forbids regular users from changing the status, even of their own report', async () => {
    const res = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(jimAuth.token))
      .send({ status: 'resolved' })
    assert.equal(res.status, 403)
  })

  void it('forbids tokens claiming the admin role for a non-admin user', async () => {
    const res = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(security.authorize({ data: { id: 2, email: `jim@${domain}`, role: 'admin' } })))
      .send({ status: 'resolved' })
    assert.equal(res.status, 403)
  })

  void it('rejects invalid statuses and ids', async () => {
    const invalidStatus = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(adminAuth.token))
      .send({ status: 'closed' })
    assert.equal(invalidStatus.status, 400)

    const invalidId = await request(app)
      .patch('/rest/review-reports/abc')
      .set(headers(adminAuth.token))
      .send({ status: 'resolved' })
    assert.equal(invalidId.status, 400)
  })

  void it('responds with 404 for reports that do not exist', async () => {
    const res = await request(app)
      .patch('/rest/review-reports/999999')
      .set(headers(adminAuth.token))
      .send({ status: 'resolved' })
    assert.equal(res.status, 404)
  })

  void it('lets administrators resolve a report and records the resolver', async () => {
    const res = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(adminAuth.token))
      .send({ status: 'resolved', ResolverId: 2 })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'resolved')
    assert.equal(res.body.data.resolver.email, `admin@${domain}`)
    assert.ok(res.body.data.resolvedAt)

    const own = await request(app)
      .get('/rest/review-reports')
      .set(headers(jimAuth.token))
    assert.equal(own.body.data[0].status, 'resolved')
    assert.equal(own.body.data[0].resolver.email, `admin@${domain}`)
  })

  void it('lets administrators reject and reopen a report', async () => {
    const rejected = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(adminAuth.token))
      .send({ status: 'rejected' })
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.data.status, 'rejected')

    const reopened = await request(app)
      .patch(`/rest/review-reports/${jimReportId}`)
      .set(headers(adminAuth.token))
      .send({ status: 'open' })
    assert.equal(reopened.status, 200)
    assert.equal(reopened.body.data.status, 'open')
    assert.equal(reopened.body.data.resolvedAt, null)
  })
})
