/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import * as security from '../../lib/insecurity'
import {
  isReviewReportReason,
  isReviewReportStatus,
  isValidReviewId,
  requireReviewReportAdmin,
  verifyRs256Token
} from '../../routes/reviewReports'

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

void describe('reviewReports', () => {
  void describe('isValidReviewId', () => {
    void it('accepts alphanumeric MarsDB ids', () => {
      assert.equal(isValidReviewId('a1B2c3D4e5F6g7H8i'), true)
    })

    void it('rejects non-string, empty, overlong and operator-like ids', () => {
      for (const id of [undefined, null, 42, { $ne: null }, ['abc'], '', 'a'.repeat(65), 'abc def', '$where', 'abc\' || 1==1']) {
        assert.equal(isValidReviewId(id), false, `expected ${JSON.stringify(id)} to be rejected`)
      }
    })
  })

  void describe('isReviewReportReason', () => {
    void it('accepts exactly the four supported reasons', () => {
      for (const reason of ['spam', 'abusive_content', 'personal_information', 'inappropriate_content']) {
        assert.equal(isReviewReportReason(reason), true)
      }
    })

    void it('rejects unknown or malformed reasons', () => {
      for (const reason of ['other', 'SPAM', '', undefined, null, ['spam'], { reason: 'spam' }]) {
        assert.equal(isReviewReportReason(reason), false)
      }
    })
  })

  void describe('isReviewReportStatus', () => {
    void it('accepts open, resolved and rejected', () => {
      for (const status of ['open', 'resolved', 'rejected']) {
        assert.equal(isReviewReportStatus(status), true)
      }
    })

    void it('rejects any other value', () => {
      for (const status of ['closed', 'Open', '', undefined, 1]) {
        assert.equal(isReviewReportStatus(status), false)
      }
    })
  })

  void describe('verifyRs256Token', () => {
    void it('accepts a token issued by the server', () => {
      const token = security.authorize({ data: { id: 1, email: 'admin@juice-sh.op', role: 'admin' } })
      const payload = verifyRs256Token(token)
      assert.equal(payload?.data?.id, 1)
    })

    void it('rejects missing and malformed tokens', () => {
      for (const token of [undefined, null, '', 'abc', 'a.b', 'a.b.c.d', '!!!.###.$$$']) {
        assert.equal(verifyRs256Token(token), null)
      }
    })

    void it('rejects unsigned tokens using the "none" algorithm', () => {
      const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ data: { id: 1, role: 'admin' } })}.`
      assert.equal(verifyRs256Token(token), null)
    })

    void it('rejects HS256 tokens signed with the public key (algorithm confusion)', () => {
      const header = base64url({ alg: 'HS256', typ: 'JWT' })
      const payload = base64url({ data: { id: 1, role: 'admin' } })
      const signature = crypto.createHmac('sha256', security.publicKey).update(`${header}.${payload}`).digest('base64url')
      assert.equal(verifyRs256Token(`${header}.${payload}.${signature}`), null)
    })

    void it('rejects tokens whose payload was tampered with', () => {
      const [header, , signature] = security.authorize({ data: { id: 2, role: 'customer' } }).split('.')
      const forgedPayload = base64url({ data: { id: 1, role: 'admin' } })
      assert.equal(verifyRs256Token(`${header}.${forgedPayload}.${signature}`), null)
    })

    void it('rejects RS256 tokens signed with a different key', () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })
      const header = base64url({ alg: 'RS256', typ: 'JWT' })
      const payload = base64url({ data: { id: 1, role: 'admin' } })
      const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')
      assert.equal(verifyRs256Token(`${header}.${payload}.${signature}`), null)
    })

    void it('rejects expired tokens', () => {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })
      const header = base64url({ alg: 'RS256', typ: 'JWT' })
      const payload = base64url({ data: { id: 1 }, exp: 1000 })
      const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')
      const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      assert.equal(verifyRs256Token(`${header}.${payload}.${signature}`, pem, 999_000)?.data?.id, 1)
      assert.equal(verifyRs256Token(`${header}.${payload}.${signature}`, pem, 1_000_000), null)
    })
  })

  void describe('requireReviewReportAdmin', () => {
    const run = (role?: string) => {
      const res: any = { locals: role ? { reviewReportActor: { id: 1, email: 'x', role } } : {} }
      res.status = mock.fn(() => res)
      res.json = mock.fn(() => res)
      const next = mock.fn()
      requireReviewReportAdmin()({} as any, res, next)
      return { res, next }
    }

    void it('calls next for administrators', () => {
      const { res, next } = run('admin')
      assert.equal(next.mock.callCount(), 1)
      assert.equal(res.status.mock.callCount(), 0)
    })

    void it('responds with 403 for every non-admin role', () => {
      for (const role of ['customer', 'deluxe', 'accounting', undefined]) {
        const { res, next } = run(role)
        assert.equal(next.mock.callCount(), 0)
        assert.equal(res.status.mock.calls[0].arguments[0], 403)
      }
    })
  })
})
