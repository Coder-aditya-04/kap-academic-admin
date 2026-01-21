import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ScanLine, Users, LayoutDashboard, UserPlus, BarChart } from 'lucide-react';

// Pages
import ScannerPage from './pages/ScannerPage';
import StudentManager from './pages/StudentManager';

import FaceEnrollment from './pages/FaceEnrollment';
import AttendanceReports from './pages/AttendanceReports'; // Import Report Page

const TopNav = () => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  // Top Navigation Link Styles
  const linkClass = (path) => `
    flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 font-medium text-sm
    ${isActive(path)
      ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.15)]'
      : 'text-neutral-400 hover:bg-white/5 hover:text-white border border-transparent'
    }
  `;

  return (
    <div className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-r from-slate-950 via-[#0a1020] to-[#0f172a] backdrop-blur-md border-b border-white/5 z-50 px-8 flex items-center justify-between shadow-2xl">

      {/* LEFT: BRAND LOGO */}
      <div className="flex items-center gap-4">
        <div className="bg-white rounded-lg p-1.5 shadow-lg border border-white/10 w-32 h-12 flex items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}kap-logo.png`}
            alt="KAP Edutech"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* CENTER: NAVIGATION */}
      <nav className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/5">
        <Link to="/" className={linkClass('/')}>
          <ScanLine className="w-4 h-4" />
          <span>Smart Gate</span>
        </Link>
        <Link to="/students" className={linkClass('/students')}>
          <Users className="w-4 h-4" />
          <span>Students & IDs</span>
        </Link>
        <Link to="/enroll" className={linkClass('/enroll')}>
          <UserPlus className="w-4 h-4" />
          <span>AI Enrollment</span>
        </Link>
        <Link to="/reports" className={linkClass('/reports')}>
          <BarChart className="w-4 h-4" />
          <span>Reports</span>
        </Link>
      </nav>

      {/* RIGHT: SYSTEM STATUS */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-white font-bold text-sm tracking-wide">Admin Portal</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">System Online</span>
          </div>
        </div>
        <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center border border-white/10 shadow-lg">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        {/* Main Content: Adjusted padding for TopNav */}
        <div className="pt-20 px-4 pb-4 md:pt-24 md:px-8 md:pb-8">
          <Routes>
            <Route path="/" element={<ScannerPage />} />
            <Route path="/students" element={<StudentManager />} />
            <Route path="/enroll" element={<FaceEnrollment />} />
            <Route path="/reports" element={<AttendanceReports />} /> {/* Route Added */}
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;