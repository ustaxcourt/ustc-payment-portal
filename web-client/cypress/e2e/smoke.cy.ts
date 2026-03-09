export { }

type PaymentStatus = 'success' | 'failed' | 'pending'

const transactionByStatus: Record<PaymentStatus, { feeName: string; agencyTrackingId: string }> = {
  success: {
    feeName: 'Fee Success Only',
    agencyTrackingId: 'agency-success-001',
  },
  failed: {
    feeName: 'Fee Failed Only',
    agencyTrackingId: 'agency-failed-001',
  },
  pending: {
    feeName: 'Fee Pending Only',
    agencyTrackingId: 'agency-pending-001',
  },
}

function mockTransactionsApi(): void {
  cy.intercept('GET', '**/api/transaction-payment-status', {
    statusCode: 200,
    body: {
      success: 1,
      failed: 1,
      pending: 1,
    },
  }).as('getStatusCounts')

  cy.intercept('GET', '**/api/transactions/*', (req) => {
    const status = req.url.split('/').pop() as PaymentStatus
    const transaction = transactionByStatus[status]

    if (!transaction) {
      req.reply({ statusCode: 404, body: { message: 'Unknown status' } })
      return
    }

    req.reply({
      statusCode: 200,
      body: {
        data: [
          {
            agencyTrackingId: transaction.agencyTrackingId,
            paygovTrackingId: null,
            feeName: transaction.feeName,
            feeId: `fee-${status}-001`,
            feeAmount: 19.95,
            clientName: 'Portal Client',
            transactionReferenceId: `ref-${status}-001`,
            paymentStatus: status,
            transactionStatus: status === 'failed' ? 'failed' : 'processed',
            paygovToken: null,
            paymentMethod: 'card',
            lastUpdatedAt: '2026-03-09T12:00:00.000Z',
            createdAt: '2026-03-09T11:00:00.000Z',
            metadata: { source: 'cypress' },
          },
        ],
        total: 1,
      },
    })
  }).as('getTransactionsByStatus')
}

describe('transactions status pages', () => {
  beforeEach(() => {
    mockTransactionsApi()
  })

  it('loads each status page by URL', () => {
    cy.visit('/transactions/success')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/success')
    cy.get('[data-status="success"]').should('exist')
    cy.contains('Fee Success Only').should('be.visible')

    cy.visit('/transactions/failed')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/failed')
    cy.get('[data-status="failed"]').should('exist')
    cy.contains('Fee Failed Only').should('be.visible')

    cy.visit('/transactions/pending')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/pending')
    cy.get('[data-status="pending"]').should('exist')
    cy.contains('Fee Pending Only').should('be.visible')
  })

  it('changes DataGrid rows when tabs are clicked', () => {
    cy.visit('/transactions/success')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')

    cy.get('[data-status="success"]').should('exist')
    cy.contains('Fee Success Only').should('be.visible')

    cy.contains('[role="tab"]', /Failed/i).click()
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/failed')
    cy.get('[data-status="failed"]').should('exist')
    cy.contains('Fee Failed Only').should('be.visible')
    cy.contains('Fee Success Only').should('not.exist')

    cy.contains('[role="tab"]', /Pending/i).click()
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/pending')
    cy.get('[data-status="pending"]').should('exist')
    cy.contains('Fee Pending Only').should('be.visible')
    cy.contains('Fee Failed Only').should('not.exist')
  })
})
