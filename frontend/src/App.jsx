import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Lobby from './components/Lobby';
import MeetingRoom from './components/MeetingRoom';
import AuthPage from './pages/AuthPage';
import ProtectedRoute from './components/ProtectedRoute';
import MobileCompanion from './components/MobileCompanion';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-indigo-500/30">
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Protected */}
            <Route path="/" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
            <Route path="/room/:roomName" element={<ProtectedRoute><MeetingRoom /></ProtectedRoute>} />
            <Route path="/companion/:sessionId" element={<MobileCompanion />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
