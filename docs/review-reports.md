# Review Reports API

Authenticated users can report product reviews. Administrators moderate the reports.

This feature is **not** part of any hacking challenge and is implemented without intentional vulnerabilities.

## Data model

Reports are stored in the `ReviewReports` SQLite table (`models/reviewReport.ts`). Reviews themselves live in MarsDB, so `reviewId` references the review's `_id`.

| Field        | Type            | Notes                                                                     |
|--------------|-----------------|---------------------------------------------------------------------------|
| `id`         | integer         | Primary key                                                               |
| `ReporterId` | integer         | User who submitted the report (taken from the session, never the body)    |
| `reviewId`   | string          | MarsDB `_id` of the reported review                                       |
| `reason`     | enum            | `spam`, `abusive_content`, `personal_information`, `inappropriate_content` |
| `status`     | enum            | `open` (default), `resolved`, `rejected`                                  |
| `ResolverId` | integer \| null | Administrator who last changed the status                                 |
| `resolvedAt` | date \| null    | Set when the status becomes `resolved`/`rejected`, cleared on `open`      |
| `createdAt`  | date            |                                                                           |
| `updatedAt`  | date            |                                                                           |

A unique index on `(ReporterId, reviewId)` prevents duplicate reports.

## Authentication

All endpoints require `Authorization: Bearer <token>` with a token issued by `/rest/user/login`.
The token signature is verified strictly (RS256 only), and the user is loaded from the database on every request, so the role comes from the `Users` table rather than from token claims.

| Response | Meaning                                                |
|----------|--------------------------------------------------------|
| `401`    | Missing/invalid/expired token, or unknown/deleted user |
| `403`    | Authenticated, but not an administrator (PATCH only)   |

## Endpoints

### `POST /rest/review-reports`

Report a review. Any authenticated user.

```json
{ "reviewId": "aB3dE5fG7hI9jK1lM", "reason": "spam" }
```

| Status | Meaning                                              |
|--------|------------------------------------------------------|
| `201`  | Created; body is `{ "status": "success", "data": <report> }` |
| `400`  | `reviewId` is not alphanumeric (1-64 chars) or `reason` is not allowed |
| `404`  | Review does not exist                                |
| `409`  | The current user already reported this review       |

`ReporterId`, `status`, `ResolverId` and other fields in the body are ignored.

### `GET /rest/review-reports[?status=open|resolved|rejected]`

List reports, newest first.

- Regular users receive only their own reports (`"scope": "own"`).
- Administrators receive all reports (`"scope": "all"`).

Returns `400` for an unknown `status` filter.

```json
{
  "status": "success",
  "scope": "own",
  "data": [
    {
      "id": 1,
      "reviewId": "aB3dE5fG7hI9jK1lM",
      "reason": "spam",
      "status": "open",
      "reporter": { "id": 2, "email": "jim@juice-sh.op" },
      "resolver": null,
      "resolvedAt": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "review": { "product": 1, "author": "bender@juice-sh.op", "message": "..." }
    }
  ]
}
```

`review` is `null` when the review no longer exists.

### `PATCH /rest/review-reports/:id`

Change a report's status. Administrators only.

```json
{ "status": "resolved" }
```

| Status | Meaning                                    |
|--------|--------------------------------------------|
| `200`  | Updated; body contains the updated report  |
| `400`  | Non-numeric id or unknown status           |
| `403`  | Caller is not an administrator             |
| `404`  | Report does not exist                      |

The resolver is always the calling administrator.

## Frontend

- Product details dialog: logged-in users get a flag button on each review that opens `ReviewReportDialogComponent`.
- `/#/review-reports` (account menu → "Review Reports"): regular users see their own reports read-only; administrators see all reports and can change the status. Access is enforced by the API, not by the route.

## Tests

| Suite        | File                                                                           |
|--------------|--------------------------------------------------------------------------------|
| Server unit  | `test/server/reviewReports.unit.test.ts`                                       |
| API          | `test/api/review-reports.test.ts`                                              |
| Frontend     | `frontend/src/app/Services/review-report.service.spec.ts`, `review-report-dialog/*.spec.ts`, `review-reports/*.spec.ts` |
| E2E          | `test/cypress/e2e/reviewReport.spec.ts`                                        |
