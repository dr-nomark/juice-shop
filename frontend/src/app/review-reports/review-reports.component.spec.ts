/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { provideZoneChangeDetection } from '@angular/core'
import { type ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { of, throwError } from 'rxjs'

import { ReviewReportsComponent } from './review-reports.component'
import { ReviewReportService } from '../Services/review-report.service'
import { SnackBarHelperService } from '../Services/snack-bar-helper.service'
import { type ReviewReport } from '../Models/review-report.model'

const report = (overrides: Partial<ReviewReport> = {}): ReviewReport => ({
    id: 1,
    reviewId: 'abc123',
    reason: 'spam',
    status: 'open',
    reporter: { id: 2, email: 'jim@juice-sh.op' },
    resolver: null,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    review: { product: 1, author: 'bender@juice-sh.op', message: 'Buy cheap stuff at ...' },
    ...overrides
})

describe('ReviewReportsComponent', () => {
    let component: ReviewReportsComponent
    let fixture: ComponentFixture<ReviewReportsComponent>
    let reviewReportService: any
    let snackBarHelperService: any

    const setup = async (scope: 'all' | 'own', data: ReviewReport[]) => {
        reviewReportService = {
            find: vi.fn().mockReturnValue(of({ scope, data })),
            updateStatus: vi.fn()
        }
        snackBarHelperService = { open: vi.fn() }
        await TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot(), ReviewReportsComponent],
            providers: [
                { provide: ReviewReportService, useValue: reviewReportService },
                { provide: SnackBarHelperService, useValue: snackBarHelperService },
                provideNoopAnimations(),
                provideZoneChangeDetection()
            ]
        }).compileComponents()
        fixture = TestBed.createComponent(ReviewReportsComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    }

    it('should show own reports read-only for regular users', async () => {
        await setup('own', [report()])
        expect(component.isModerator).toBe(false)
        expect(component.columns).not.toContain('reporter')
        expect(fixture.nativeElement.querySelectorAll('mat-select').length).toBe(0)
        expect(fixture.nativeElement.querySelectorAll('.review-report-row').length).toBe(1)
    })

    it('should show status controls and reporter for administrators', async () => {
        await setup('all', [report(), report({ id: 2, reporter: { id: 3, email: 'bender@juice-sh.op' } })])
        expect(component.isModerator).toBe(true)
        expect(component.columns).toContain('reporter')
        expect(fixture.nativeElement.querySelectorAll('mat-select').length).toBe(2)
    })

    it('should show an empty state when there are no reports', async () => {
        await setup('own', [])
        expect(fixture.nativeElement.querySelector('.noResultText')).toBeTruthy()
    })

    it('should update a report status and replace it in the list', async () => {
        await setup('all', [report()])
        reviewReportService.updateStatus.mockReturnValue(of(report({ status: 'resolved', resolver: { id: 1, email: 'admin@juice-sh.op' } })))
        component.changeStatus(component.reports[0], 'resolved')
        expect(reviewReportService.updateStatus).toHaveBeenCalledWith(1, 'resolved')
        expect(component.reports[0].status).toBe('resolved')
        expect(component.reports[0].resolver?.email).toBe('admin@juice-sh.op')
        expect(snackBarHelperService.open).toHaveBeenCalledWith('REVIEW_REPORT_STATUS_UPDATED', 'confirmBar')
    })

    it('should not call the api for non-moderators or unchanged status', async () => {
        await setup('own', [report()])
        component.changeStatus(component.reports[0], 'resolved')
        component.isModerator = true
        component.changeStatus(component.reports[0], 'open')
        expect(reviewReportService.updateStatus).not.toHaveBeenCalled()
    })

    it('should reload the list when a status update fails', async () => {
        await setup('all', [report()])
        reviewReportService.updateStatus.mockReturnValue(throwError(() => ({ status: 403 })))
        component.changeStatus(component.reports[0], 'rejected')
        expect(snackBarHelperService.open).toHaveBeenCalledWith('REVIEW_REPORT_STATUS_UPDATE_FAILED', 'errorBar')
        expect(reviewReportService.find).toHaveBeenCalledTimes(2)
    })

    it('should keep the error when loading fails', async () => {
        reviewReportService = { find: vi.fn().mockReturnValue(throwError(() => ({ status: 401 }))), updateStatus: vi.fn() }
        await TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot(), ReviewReportsComponent],
            providers: [
                { provide: ReviewReportService, useValue: reviewReportService },
                { provide: SnackBarHelperService, useValue: { open: vi.fn() } },
                provideNoopAnimations(),
                provideZoneChangeDetection()
            ]
        }).compileComponents()
        fixture = TestBed.createComponent(ReviewReportsComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
        expect(component.error).toEqual({ status: 401 })
        expect(component.reports).toEqual([])
    })
})
