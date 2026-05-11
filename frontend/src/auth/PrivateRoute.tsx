// src/auth/PrivateRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, Role } from "./AuthProvider";

type Props = {
  children: JSX.Element;
  roles?: Role[];
};

const PrivateRoute = ({ children, roles }: Props) => {
  const auth = useAuth();
  const location = useLocation();

  // ❌ Not logged in
  if (!auth.token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ❌ Logged in but wrong role
  if (roles && auth.role && !roles.includes(auth.role)) {
    return <Navigate to="/home" replace />;
  }

  return children;
};

export default PrivateRoute;
