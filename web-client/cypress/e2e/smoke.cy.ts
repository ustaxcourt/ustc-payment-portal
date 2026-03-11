export { }

type PaymentStatus = 'SUCCESS' | 'FAILED' | 'PENDING'

const transactionByStatus: Record<PaymentStatus, { feeName: string; agencyTrackingId: string }> = {
  SUCCESS: {
    feeName: 'Fee Success Only',
    agencyTrackingId: 'agency-SUCCESS-001',
  },
  FAILED: {
    feeName: 'Fee Failed Only',
    agencyTrackingId: 'agency-FAILED-001',
  },
  PENDING: {
    feeName: 'Fee Pending Only',
    agencyTrackingId: 'agency-PENDING-001',
  },
}

function mockTransactionsApi(): void {
  cy.intercept('GET', '**/api/transaction-payment-status', {
    statusCode: 200,
    body: {
      SUCCESS: 1,
      FAILED: 1,
      PENDING: 1,
    },
  }).as('getStatusCounts')

  cy.intercept('GET', '**/api/transactions/*', (req) => {
    const status = req.url.split('/').pop()?.toUpperCase() as PaymentStatus
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
            transactionStatus: status === 'FAILED' ? 'FAILED' : 'PROCESSED',
            paygovToken: null,
            paymentMethod: 'PLASTIC_CARD',
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
    cy.get('[data-status="SUCCESS"]').should('exist')
    cy.contains('Fee Success Only').should('be.visible')

    cy.visit('/transactions/failed')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/failed')
    cy.get('[data-status="FAILED"]').should('exist')
    cy.contains('Fee Failed Only').should('be.visible')

    cy.visit('/transactions/pending')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/pending')
    cy.get('[data-status="PENDING"]').should('exist')
    cy.contains('Fee Pending Only').should('be.visible')
  })

  it('changes DataGrid rows when tabs are clicked', () => {
    cy.visit('/transactions/success')
    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')

    cy.get('[data-status="SUCCESS"]').should('exist')
    cy.contains('Fee Success Only').should('be.visible')

    cy.contains('[role="tab"]', /Failed/i).click()
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/failed')
    cy.get('[data-status="FAILED"]').should('exist')
    cy.contains('Fee Failed Only').should('be.visible')
    cy.contains('Fee Success Only').should('not.exist')

    cy.contains('[role="tab"]', /Pending/i).click()
    cy.wait('@getTransactionsByStatus')
    cy.location('pathname').should('eq', '/transactions/pending')
    cy.get('[data-status="PENDING"]').should('exist')
    cy.contains('Fee Pending Only').should('be.visible')
    cy.contains('Fee Failed Only').should('not.exist')
  })
})
