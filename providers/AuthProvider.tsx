'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authClient from '@/lib/api/auth';
import type { AuthUser, RegisterPayload } from '@/lib/api/auth';
import {
  DEV_BYPASS_CHANGE_EVENT,
  getDevBypassUser,
  isDevBypassEnabled,
  setDevBypassStep,
} from './dev-auth-bypass';

interface AuthContextValue {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateOnboardingStep: (step: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {
    throw new Error('AuthProvider not mounted');
  },
  register: async () => {
    throw new Error('AuthProvider not mounted');
  },
  logout: async () => {},
  updateOnboardingStep: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── DEV-ONLY AUTH BYPASS ──────────────────────────────────────────────
  // See providers/dev-auth-bypass.ts. Lets the gated pages be clicked
  // through without a running backend. No-ops in production builds.
  // Remove this block (and the import above) once the real backend is live.
  useEffect(() => {
    const syncFromBypass = () => {
      if (isDevBypassEnabled()) {
        setCurrentUser(getDevBypassUser());
        setIsLoading(false);
        return true;
      }
      return false;
    };

    if (syncFromBypass()) {
      window.addEventListener(DEV_BYPASS_CHANGE_EVENT, syncFromBypass);
      return () => window.removeEventListener(DEV_BYPASS_CHANGE_EVENT, syncFromBypass);
    }

    window.addEventListener(DEV_BYPASS_CHANGE_EVENT, syncFromBypass);
    authClient
      .me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setIsLoading(false));
    return () => window.removeEventListener(DEV_BYPASS_CHANGE_EVENT, syncFromBypass);
  }, []);
  // ── END DEV-ONLY AUTH BYPASS ──────────────────────────────────────────

  const login = async (email: string, password: string) => {
    if (isDevBypassEnabled()) {
      const user = getDevBypassUser();
      setCurrentUser(user);
      return user;
    }
    const { user } = await authClient.login(email, password);
    setCurrentUser(user);
    return user;
  };

  const register = async (payload: RegisterPayload) => {
    if (isDevBypassEnabled()) {
      const user = getDevBypassUser();
      setCurrentUser(user);
      return user;
    }
    const { user } = await authClient.register(payload);
    setCurrentUser(user);
    return user;
  };

  const logout = async () => {
    if (isDevBypassEnabled()) {
      setCurrentUser(null);
      return;
    }
    await authClient.logout();
    setCurrentUser(null);
  };

  const updateOnboardingStep = async (step: number) => {
    if (isDevBypassEnabled()) {
      setDevBypassStep(step);
      setCurrentUser((u) => (u ? { ...u, onboardingStep: step } : null));
      return;
    }
    const { onboardingStep } = await authClient.updateOnboardingStep(step);
    setCurrentUser((u) => (u ? { ...u, onboardingStep } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        register,
        logout,
        updateOnboardingStep,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
