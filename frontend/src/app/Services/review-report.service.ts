/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { environment } from '../../environments/environment'
import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { catchError, map } from 'rxjs/operators'
import { type ReviewReport, type ReviewReportList, type ReviewReportReason, type ReviewReportStatus } from '../Models/review-report.model'

@Injectable({
  providedIn: 'root'
})
export class ReviewReportService {
  private readonly http = inject(HttpClient)

  private readonly hostServer = environment.hostServer
  private readonly host = this.hostServer + '/rest/review-reports'

  create (reviewId: string, reason: ReviewReportReason) {
    return this.http.post(this.host, { reviewId, reason }).pipe(
      map((response: any) => response.data as ReviewReport),
      catchError((err) => { throw err })
    )
  }

  find () {
    return this.http.get(this.host).pipe(
      map((response: any) => ({ scope: response.scope, data: response.data }) as ReviewReportList),
      catchError((err) => { throw err })
    )
  }

  updateStatus (id: number, status: ReviewReportStatus) {
    return this.http.patch(`${this.host}/${id}`, { status }).pipe(
      map((response: any) => response.data as ReviewReport),
      catchError((err) => { throw err })
    )
  }
}
