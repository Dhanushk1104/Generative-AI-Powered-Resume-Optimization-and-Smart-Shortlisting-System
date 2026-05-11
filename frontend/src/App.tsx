// src/App.tsx
// ─── FINAL ROLE-BASED REDIRECT VERSION ─────────────────────────

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Home from "./pages/Home";
import History from "./pages/History";
import ApplicantDashboard from "./pages/ApplicantDashboard";
import ResumeEnhancer from "./pages/ResumeEnhancer";
import EditProfile from "./pages/EditProfile";
import Admin from "./pages/Admin";
import BulkUpload from "./pages/BulkUpload";

import HRHome from "./pages/HRHome";
import HRDashboard from "./pages/HRDashboard";

import PrivateRoute from "./auth/PrivateRoute";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import Navbar from "./components/Navbar";

/* ---------------- Role-Based Default Redirect ---------------- */
/* ---------------- Role-Based Default Redirect ---------------- */
function DefaultRedirect() {
  const auth = useAuth();

  if (!auth.token) return <Navigate to="/login" replace />;

  // 🔥 HR → hr-home
  if (auth.role === "HR") {
    return <Navigate to="/hr-home" replace />;
  }

  // 🔥 ADMIN (if you want admin also in HR layout, keep here)
  if (auth.role === "ADMIN") {
    return <Navigate to="/hr-home" replace />;
  }

  // 👤 All other users → home
  return <Navigate to="/home" replace />;
}

/* ---------------- Navbar Wrapper ---------------- */
function NavbarWrapper() {
  const location = useLocation();

  // Hide navbar on auth + HR layout pages
  const hidden = ["/login", "/signup", "/hr-home", "/hr"];

  if (hidden.includes(location.pathname)) return null;

  return <Navbar />;
}

/* ---------------- App Shell ---------------- */
function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavbarWrapper />

      <Routes>
        {/* PUBLIC */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* USER HOME */}
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />

        {/* USER ROUTES */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <ApplicantDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/history"
          element={
            <PrivateRoute>
              <History />
            </PrivateRoute>
          }
        />

        <Route
          path="/edit-profile"
          element={
            <PrivateRoute>
              <EditProfile />
            </PrivateRoute>
          }
        />

        <Route
          path="/resume-enhancer"
          element={
            <PrivateRoute roles={["FRESHER", "STUDENT", "OTHER", "ADMIN"]}>
              <ResumeEnhancer />
            </PrivateRoute>
          }
        />

        {/* HR ROUTES */}
        <Route
          path="/hr-home"
          element={
            <PrivateRoute roles={["HR", "ADMIN"]}>
              <HRHome />
            </PrivateRoute>
          }
        />

        <Route
          path="/hr"
          element={
            <PrivateRoute roles={["HR", "ADMIN"]}>
              <HRDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/bulk-upload"
          element={
            <PrivateRoute roles={["HR", "ADMIN"]}>
              <BulkUpload />
            </PrivateRoute>
          }
        />

        {/* ADMIN ONLY */}
        <Route
          path="/admin"
          element={
            <PrivateRoute roles={["ADMIN"]}>
              <Admin />
            </PrivateRoute>
          }
        />

        {/* DEFAULT */}
        <Route path="/" element={<DefaultRedirect />} />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </div>
  );
}

/* ---------------- Root App ---------------- */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;