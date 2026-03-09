export { }

describe('transactions loading and empty states', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/transaction-payment-status', {
      statusCode: 200,
      body: {
        success: 1,
        failed: 0,
        pending: 0,
      },
    }).as('getStatusCounts')
  })

  it('handles delayed DataGrid response and renders rows after completion', () => {
    cy.intercept('GET', '**/api/transactions/success', {
      statusCode: 200,
      delay: 1200,
      body: {
        data: [
          {
            agencyTrackingId: 'agency-success-loading-001',
            paygovTrackingId: null,
            feeName: 'Fee Loaded After Delay',
            feeId: 'fee-success-loading-001',
            feeAmount: 10,
            clientName: 'Portal Client',
            transactionReferenceId: 'ref-success-loading-001',
            paymentStatus: 'success',
            transactionStatus: 'processed',
            paygovToken: null,
            paymentMethod: 'card',
            lastUpdatedAt: '2026-03-09T12:00:00.000Z',
            createdAt: '2026-03-09T11:00:00.000Z',
            metadata: { source: 'cypress' },
          },
        ],
        total: 1,
      },
    }).as('getSuccessTransactionsDelayed')

    cy.visit('/transactions/success')

    cy.wait('@getStatusCounts')
    cy.contains('Fee Loaded After Delay').should('not.exist')

    cy.wait('@getSuccessTransactionsDelayed')
    cy.contains('Fee Loaded After Delay').should('be.visible')
  })

  it('shows empty grid state when API returns zero rows', () => {
    cy.intercept('GET', '**/api/transactions/failed', {
      statusCode: 200,
      body: {
        data: [],
        total: 0,
      },
    }).as('getFailedTransactionsEmpty')

    cy.visit('/transactions/failed')

    cy.wait('@getStatusCounts')
    cy.wait('@getFailedTransactionsEmpty')

    cy.get('[data-status="failed"]').should('exist')
    cy.contains('No rows').should('be.visible')
  })
})
