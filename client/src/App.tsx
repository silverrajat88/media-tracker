

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import HomePage from './pages/HomePage';
import DetailPage from './pages/DetailPage';
import SettingsPage from './pages/SettingsPage';
import { BulkEditPage } from './pages/BulkEditPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/item/:id" element={<DetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/bulk-edit" element={<BulkEditPage />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}

export default App;

