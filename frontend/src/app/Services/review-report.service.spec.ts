/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { ReviewReportService } from './review-report.service'

describe('ReviewReportService', () => {
    let service: ReviewReportService
    let httpMock: HttpTestingController

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [ReviewReportService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
        })
        service = TestBed.inject(ReviewReportService)
        httpMock = TestBed.inject(HttpTestingController)
    })

    afterEach(() => {
        httpMock.verify()
    })

    it('should be created', () => {
        expect(service).toBeTruthy()
    })

    it('should create a review report via the rest api', () => {
        let res: any
        service.create('abc123', 'spam').subscribe((data) => (res = data))
        const req = httpMock.expectOne('http://localhost:3000/rest/review-reports')
        req.flush({ status: 'success', data: { id: 1 } })
        expect(req.request.method).toBe('POST')
        expect(req.request.body).toEqual({ reviewId: 'abc123', reason: 'spam' })
        expect(res).toEqual({ id: 1 })
    })

    it('should list review reports together with their scope', () => {
        let res: any
        service.find().subscribe((data) => (res = data))
        const req = httpMock.expectOne('http://localhost:3000/rest/review-reports')
        req.flush({ status: 'success', scope: 'own', data: [{ id: 1 }] })
        expect(req.request.method).toBe('GET')
        expect(res).toEqual({ scope: 'own', data: [{ id: 1 }] })
    })

    it('should update the status of a review report', () => {
        let res: any
        service.updateStatus(42, 'resolved').subscribe((data) => (res = data))
        const req = httpMock.expectOne('http://localhost:3000/rest/review-reports/42')
        req.flush({ status: 'success', data: { id: 42, status: 'resolved' } })
        expect(req.request.method).toBe('PATCH')
        expect(req.request.body).toEqual({ status: 'resolved' })
        expect(res).toEqual({ id: 42, status: 'resolved' })
    })

    it('should propagate errors when reporting a review', () => {
        let capturedError: any
        service.create('abc123', 'spam').subscribe({ next: () => {}, error: (e) => { capturedError = e } })
        const req = httpMock.expectOne('http://localhost:3000/rest/review-reports')
        req.flush({ error: 'Review already reported' }, { status: 409, statusText: 'Conflict' })
        expect(capturedError.status).toBe(409)
    })
})
