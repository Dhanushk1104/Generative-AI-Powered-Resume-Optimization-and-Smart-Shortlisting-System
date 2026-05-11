// src/auth/AuthProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import API from "../api/api";

/* ✅ MATCH BACKEND ROLES */
export type Role = "ADMIN" | "HR" | "FRESHER" | "STUDENT" | "OTHER";

interface LoginResponse {
  token: string;
  role: Role;
}

interface MeResponse {
  username: string;
  email: string;
  role: Role;
}

type AuthContextType = {
  token: string | null;
  role: Role | null;
  username: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [role, setRole] = useState<Role | null>(
    localStorage.getItem("role") as Role | null
  );
  const [username, setUsername] = useState<string | null>(
    localStorage.getItem("username")
  );

  /* ✅ ALWAYS SET BEARER TOKEN */
  useEffect(() => {
    if (token) {
      API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete API.defaults.headers.common["Authorization"];
    }
  }, [token]);

  /* ✅ FETCH USER DETAILS ON REFRESH */
  useEffect(() => {
    if (!token) return;

    API.get<MeResponse>("/auth/me")
      .then((res) => {
        setUsername(res.data.username);
        setRole(res.data.role);
        localStorage.setItem("username", res.data.username);
        localStorage.setItem("role", res.data.role);
      })
      .catch(() => {
        logout();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ✅ LOGIN */
  const login = async (email: string, password: string) => {
    const res = await API.post<LoginResponse>("/auth/login", {
      email,
      password,
    });

    const normalizedRole = res.data.role.toUpperCase() as Role;

    setToken(res.data.token);
    setRole(normalizedRole);

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("role", normalizedRole);

    API.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
  };

  /* ✅ LOGOUT */
  const logout = () => {
    setToken(null);
    setRole(null);
    setUsername(null);
    localStorage.clear();
    delete API.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider value={{ token, role, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
