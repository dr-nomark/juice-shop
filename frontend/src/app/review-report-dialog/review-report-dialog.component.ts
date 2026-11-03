/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogContent, MatDialogActions, MatDialogClose, MatDialogTitle } from '@angular/material/dialog'
import { UntypedFormControl, Validators, ReactiveFormsModule } from '@angular/forms'
import { MatRadioModule } from '@angular/material/radio'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { TranslateModule } from '@ngx-translate/core'
import { ReviewReportService } from '../Services/review-report.service'
import { SnackBarHelperService } from '../Services/snack-bar-helper.service'
import { type Review } from '../Models/review.model'
import { REVIEW_REPORT_REASONS } from '../Models/review-report.model'

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-review-report-dialog',
  templateUrl: './review-report-dialog.component.html',
  styleUrls: ['./review-report-dialog.component.scss'],
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, ReactiveFormsModule, MatRadioModule, MatButtonModule, MatIconModule, TranslateModule]
})
export class ReviewReportDialogComponent {
  data = inject<{ review: Review }>(MAT_DIALOG_DATA)
  private readonly reviewReportService = inject(ReviewReportService)
  private readonly dialogRef = inject<MatDialogRef<ReviewReportDialogComponent>>(MatDialogRef)
  private readonly snackBarHelperService = inject(SnackBarHelperService)

  public reasons = REVIEW_REPORT_REASONS
  public reasonControl = new UntypedFormControl(null, [Validators.required])
  public submitting = false

  submit () {
    if (this.reasonControl.invalid || this.submitting) return
    this.submitting = true
    this.reviewReportService.create(this.data.review._id, this.reasonControl.value).subscribe({
      next: () => {
        this.snackBarHelperService.open('CONFIRM_REVIEW_REPORTED', 'confirmBar')
        this.dialogRef.close(true)
      },
      error: (err) => {
        this.submitting = false
        this.snackBarHelperService.open(err?.status === 409 ? 'REVIEW_REPORT_DUPLICATE' : 'REVIEW_REPORT_FAILED', 'errorBar')
        if (err?.status === 409) {
          this.dialogRef.close(false)
        }
      }
    })
  }
}
