export { }

describe('transactions errors', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/transaction-payment-status', {
      statusCode: 200,
      body: {
        SUCCESS: 1,
        FAILED: 1,
        PENDING: 1,
      },
    }).as('getStatusCounts')
  })

  it('shows an error alert when transactions request fails', () => {
    cy.intercept('GET', '**/api/transactions/success', {
      statusCode: 500,
      body: { message: 'Internal server error' },
    }).as('getSuccessTransactions')

    cy.visit('/transactions/success')

    cy.wait('@getStatusCounts')
    cy.wait('@getSuccessTransactions')

    cy.get('[data-status="SUCCESS"]').should('exist')
    cy.get('[role="alert"]').should('be.visible').and('contain.text', 'failed: 500')
  })
})
