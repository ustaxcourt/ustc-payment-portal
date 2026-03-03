import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App'
import TransactionsLayout from './features/transactions/pages/TransactionsLayout'
import TransactionsStatusPage from './features/transactions/pages/TransactionsStatusPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Redirect "/" → "/transactions/successful"
      { index: true, element: <Navigate to="/transactions/successful" replace /> },

      {
        path: 'transactions',
        element: <TransactionsLayout />,
        children: [
          // Redirect "/transactions" → "/transactions/successful"
          { index: true, element: <Navigate to="successful" replace /> },
          { path: 'successful', element: <TransactionsStatusPage status="SUCCESS" /> },
          { path: 'failed', element: <TransactionsStatusPage status="FAILED" /> },
          { path: 'pending', element: <TransactionsStatusPage status="PENDING" /> },
        ],
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
