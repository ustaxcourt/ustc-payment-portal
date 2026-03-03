import * as React from 'react';
import './App.css'
import { Outlet } from 'react-router-dom';

function App(): React.ReactElement {
  return (
    <>
      <Outlet />
    </>
  )
}

export default App
