describe('/#/review-reports', () => {
  describe('as a regular user', () => {
    beforeEach(() => {
      cy.login({ email: 'jim', password: 'ncc-1701' })
    })

    it('should be possible to report a product review and see it in the own report list', () => {
      cy.visit('/#/search')
      cy.contains('app-product', 'Apple Juice').find('section[role="button"]').click()
      cy.get('mat-expansion-panel[aria-label="Expand for Reviews"]').click()
      cy.get('.report-review-button').first().click()
      cy.get('#reason-spam label').click()
      cy.get('#submitReviewReportButton').click()

      cy.visit('/#/review-reports')
      cy.get('.review-report-row').should('have.length.at.least', 1)
      cy.get('.reporter-cell').should('not.exist')
      cy.get('mat-select').should('not.exist')
    })

    it('should not be possible to change the status of a report through the API', () => {
      cy.window().then((win) => {
        const token = win.localStorage.getItem('token')
        cy.request({
          method: 'GET',
          url: '/rest/review-reports',
          headers: { Authorization: `Bearer ${token}` }
        }).then((response) => {
          expect(response.body.scope).to.equal('own')
          cy.request({
            method: 'PATCH',
            url: `/rest/review-reports/${response.body.data[0].id}`,
            headers: { Authorization: `Bearer ${token}` },
            body: { status: 'resolved' },
            failOnStatusCode: false
          }).its('status').should('equal', 403)
        })
      })
    })
  })

  describe('as an administrator', () => {
    beforeEach(() => {
      cy.login({ email: 'admin', password: 'admin123' })
    })

    it('should be possible to see all reports and resolve one', () => {
      cy.visit('/#/review-reports')
      cy.get('.review-report-row').should('have.length.at.least', 1)
      cy.get('.reporter-cell').first().should('contain', 'jim@')
      cy.get('.review-report-row').first().find('mat-select').click()
      cy.get('mat-option').contains('Resolved').click()
      cy.get('.resolver-cell').first().should('contain', 'admin@')
    })
  })

  it('should reject unauthenticated access to the API', () => {
    cy.request({ url: '/rest/review-reports', failOnStatusCode: false }).its('status').should('equal', 401)
  })
})
