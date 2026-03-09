export { }

type PaymentStatus = 'success' | 'failed' | 'pending'

const totalsByStatus: Record<PaymentStatus, number> = {
  success: 2,
  failed: 4,
  pending: 1,
}

const labelByStatus: Record<PaymentStatus, string> = {
  success: 'Success Tab Row',
  failed: 'Failed Tab Row',
  pending: 'Pending Tab Row',
}

function assertTabCount(tabLabel: string, count: number): void {
  cy.contains('[role="tab"]', new RegExp(tabLabel, 'i')).should('contain.text', `${count}`)
}

describe('transactions tab counts', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/transaction-payment-status', {
      statusCode: 200,
      body: {
        success: 9,
        failed: 7,
        pending: 5,
      },
    }).as('getStatusCounts')

    cy.intercept('GET', '**/api/transactions/*', (req) => {
      const status = req.url.split('/').pop() as PaymentStatus
      const total = totalsByStatus[status]
      const feeName = labelByStatus[status]

      req.reply({
        statusCode: 200,
        body: {
          data: [
            {
              agencyTrackingId: `agency-${status}-count-001`,
              paygovTrackingId: null,
              feeName,
              feeId: `fee-${status}-count-001`,
              feeAmount: 25,
              clientName: 'Portal Client',
              transactionReferenceId: `ref-${status}-count-001`,
              paymentStatus: status,
              transactionStatus: status === 'failed' ? 'failed' : 'processed',
              paygovToken: null,
              paymentMethod: 'card',
              lastUpdatedAt: '2026-03-09T12:00:00.000Z',
              createdAt: '2026-03-09T11:00:00.000Z',
              metadata: { source: 'cypress' },
            },
          ],
          total,
        },
      })
    }).as('getTransactionsByStatus')
  })

  it('initializes from counts endpoint and updates each tab count from loaded data totals', () => {
    cy.visit('/transactions/success')

    cy.wait('@getStatusCounts')
    cy.wait('@getTransactionsByStatus')

    assertTabCount('Successful', 2)
    assertTabCount('Failed', 7)
    assertTabCount('Pending', 5)

    cy.contains('[role="tab"]', /Failed/i).click()
    cy.wait('@getTransactionsByStatus')
    assertTabCount('Successful', 2)
    assertTabCount('Failed', 4)
    assertTabCount('Pending', 5)
    cy.contains('Failed Tab Row').should('be.visible')

    cy.contains('[role="tab"]', /Pending/i).click()
    cy.wait('@getTransactionsByStatus')
    assertTabCount('Successful', 2)
    assertTabCount('Failed', 4)
    assertTabCount('Pending', 1)
    cy.contains('Pending Tab Row').should('be.visible')
  })
})
