import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import Login from './pages/Login';
import Enroll from './pages/Enroll';
import Scanner from './pages/Scanner';
import SignReview from './pages/SignReview';
import SignSuccess from './pages/SignSuccess';
import History from './pages/History';
import SignUpload from './pages/SignUpload';
import Verify from './pages/Verify';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no auth required */}
        <Route path="/login" element={<Login />} />
        <Route path="/verify/:sealId" element={<Verify />} />

        {/* Protected routes — wrapped by AuthGate */}
        <Route element={<AuthGate />}>
          <Route path="/" element={<Navigate to="/history" replace />} />
          <Route path="/history" element={<History />} />
          <Route path="/upload" element={<SignUpload />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/scan/:requestId" element={<SignReview />} />
          <Route path="/sign-success" element={<SignSuccess />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
