import { useState } from 'react'
import Navbar from './components/Navbar'
import { Route, Routes } from 'react-router-dom'
import Registration from './pages/Registation'
import Login from './pages/Login'


function App() {

  return (
    <div>
      <Navbar/>

      <Routes>
        <Route path={'/signup'} element={<Registration/>} />
        <Route path={'/login'} element={<Login/>} />
      </Routes>

    </div>
  )
}

export default App
