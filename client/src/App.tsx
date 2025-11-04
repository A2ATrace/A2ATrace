// import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.scss';
import Dashboard from './pages/dashboard/dashboard';
import Statistics from './pages/statistics/statistics';

function App() {
  return (
    <Router>
      <div className='body-wrapper'>
        <Routes>
          <Route path='/' element={<Dashboard />} />
          <Route path='/statistics' element={<Statistics />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
