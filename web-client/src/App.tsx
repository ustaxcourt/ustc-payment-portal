import * as React from 'react';
import './App.css'
import TransactionLogPage from './features/transactions/pages/TransactionLogPage'
import { Container } from '@mui/material'

function App(): React.ReactElement {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <TransactionLogPage />
    </Container>
  )
}

export default App
