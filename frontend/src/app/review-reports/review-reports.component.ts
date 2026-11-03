/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, type OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { DatePipe } from '@angular/common'
import { MatCardModule } from '@angular/material/card'
import { MatTableModule } from '@angular/material/table'
import { MatSelectModule } from '@angular/material/select'
import { MatFormFieldModule } from '@angular/material/form-field'
import { TranslateModule } from '@ngx-translate/core'
import { ReviewReportService } from '../Services/review-report.service'
import { SnackBarHelperService } from '../Services/snack-bar-helper.service'
import { REVIEW_REPORT_STATUSES, type ReviewReport, type ReviewReportStatus } from '../Models/review-report.model'

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-review-reports',
  templateUrl: './review-reports.component.html',
  styleUrls: ['./review-reports.component.scss'],
  imports: [MatCardModule, MatTableModule, MatSelectModule, MatFormFieldModule, TranslateModule, DatePipe]
})
export class ReviewReportsComponent implements OnInit {
  private readonly reviewReportService = inject(ReviewReportService)
  private readonly snackBarHelperService = inject(SnackBarHelperService)

  public reports: ReviewReport[] = []
  public isModerator = false
  public statuses = REVIEW_REPORT_STATUSES
  public columns: string[] = []
  public error: any

  ngOnInit (): void {
    this.load()
  }

  load () {
    this.reviewReportService.find().subscribe({
      next: ({ scope, data }) => {
        this.isModerator = scope === 'all'
        this.columns = this.isModerator
          ? ['review', 'reason', 'reporter', 'createdAt', 'status', 'resolver']
          : ['review', 'reason', 'createdAt', 'status', 'resolver']
        this.reports = data
      },
      error: (err) => {
        this.error = err
      }
    })
  }

  changeStatus (report: ReviewReport, status: ReviewReportStatus) {
    if (!this.isModerator || report.status === status) return
    this.reviewReportService.updateStatus(report.id, status).subscribe({
      next: (updated) => {
        this.reports = this.reports.map(r => r.id === updated.id ? updated : r)
        this.snackBarHelperService.open('REVIEW_REPORT_STATUS_UPDATED', 'confirmBar')
      },
      error: () => {
        this.snackBarHelperService.open('REVIEW_REPORT_STATUS_UPDATE_FAILED', 'errorBar')
        this.load()
      }
    })
  }
}
