import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import theme from './theme'
import './index.css'

import App from './App'
import TransactionsLayout from './features/transactions/pages/TransactionsLayout'
import TransactionsStatusPage from './features/transactions/pages/TransactionsStatusPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/transactions/success" replace /> },
      {
        path: 'transactions',
        element: <TransactionsLayout />,
        children: [
          { index: true, element: <Navigate to="success" replace /> },
          { path: 'success', element: <TransactionsStatusPage status="SUCCESS" /> },
          { path: 'failed', element: <TransactionsStatusPage status="FAILED" /> },
          { path: 'pending', element: <TransactionsStatusPage status="PENDING" /> },
        ],
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
)
