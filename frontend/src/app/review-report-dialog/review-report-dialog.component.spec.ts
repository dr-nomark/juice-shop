/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { provideZoneChangeDetection } from '@angular/core'
import { type ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { of, throwError } from 'rxjs'

import { ReviewReportDialogComponent } from './review-report-dialog.component'
import { ReviewReportService } from '../Services/review-report.service'
import { SnackBarHelperService } from '../Services/snack-bar-helper.service'

describe('ReviewReportDialogComponent', () => {
    let component: ReviewReportDialogComponent
    let fixture: ComponentFixture<ReviewReportDialogComponent>
    let reviewReportService: any
    let dialogRef: any
    let snackBarHelperService: any

    beforeEach(async () => {
        reviewReportService = { create: vi.fn().mockReturnValue(of({ id: 1 })) }
        dialogRef = { close: vi.fn() }
        snackBarHelperService = { open: vi.fn() }

        await TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot(), ReviewReportDialogComponent],
            providers: [
                { provide: ReviewReportService, useValue: reviewReportService },
                { provide: MatDialogRef, useValue: dialogRef },
                { provide: SnackBarHelperService, useValue: snackBarHelperService },
                { provide: MAT_DIALOG_DATA, useValue: { review: { _id: 'abc123', author: 'jim@juice-sh.op', message: 'Spam spam' } } },
                provideZoneChangeDetection()
            ]
        }).compileComponents()

        fixture = TestBed.createComponent(ReviewReportDialogComponent)
        component = fixture.componentInstance
        fixture.detectChanges()
    })

    it('should create', () => {
        expect(component).toBeTruthy()
    })

    it('should offer exactly the four supported reasons', () => {
        expect(component.reasons).toEqual(['spam', 'abusive_content', 'personal_information', 'inappropriate_content'])
    })

    it('should not submit without a selected reason', () => {
        component.submit()
        expect(reviewReportService.create).not.toHaveBeenCalled()
    })

    it('should report the review with the selected reason and close the dialog', () => {
        component.reasonControl.setValue('personal_information')
        component.submit()
        expect(reviewReportService.create).toHaveBeenCalledWith('abc123', 'personal_information')
        expect(snackBarHelperService.open).toHaveBeenCalledWith('CONFIRM_REVIEW_REPORTED', 'confirmBar')
        expect(dialogRef.close).toHaveBeenCalledWith(true)
    })

    it('should show a duplicate message and close the dialog when the review was already reported', () => {
        reviewReportService.create.mockReturnValue(throwError(() => ({ status: 409 })))
        component.reasonControl.setValue('spam')
        component.submit()
        expect(snackBarHelperService.open).toHaveBeenCalledWith('REVIEW_REPORT_DUPLICATE', 'errorBar')
        expect(dialogRef.close).toHaveBeenCalledWith(false)
    })

    it('should keep the dialog open on other errors so the user can retry', () => {
        reviewReportService.create.mockReturnValue(throwError(() => ({ status: 500 })))
        component.reasonControl.setValue('spam')
        component.submit()
        expect(snackBarHelperService.open).toHaveBeenCalledWith('REVIEW_REPORT_FAILED', 'errorBar')
        expect(dialogRef.close).not.toHaveBeenCalled()
        expect(component.submitting).toBe(false)
    })
})
