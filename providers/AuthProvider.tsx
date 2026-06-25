'use client';
import { createContext, useContext } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }