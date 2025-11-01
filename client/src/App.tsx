// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/dashboard/Dashboard';
import Statistics from './pages/statistics/Statistics';
import Configuration from './pages/configuration/Configuration';
import Visualizer from './pages/visualizer/Visualizer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path='/' element={<Dashboard />} />
        <Route path='/config' element={<Configuration />} />
        <Route path='/visualizer' element={<Visualizer />} />
        <Route path='/statistics' element={<Statistics />} />
      </Routes>
    </Router>
  );
}
export default App;
