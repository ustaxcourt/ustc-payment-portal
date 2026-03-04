import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import theme from './theme'
import './index.css'

import App from './App'
import TransactionsLayout from './pages/TransactionsLayout'
import TransactionsStatusPage from './pages/TransactionsStatusPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/transactions/completed" replace /> },
      {
        path: 'transactions',
        element: <TransactionsLayout />,
        children: [
          { index: true, element: <Navigate to="completed" replace /> },
          { path: 'completed', element: <TransactionsStatusPage status="COMPLETED" /> },
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
