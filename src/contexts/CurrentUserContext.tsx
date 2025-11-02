import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface CurrentUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  image_url?: string | null;
  team_id?: string | null;
  workspace_id?: string | null;
  membership_role?: string | null;
}

interface CurrentUserContextType {
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

interface ProviderProps {
  children: ReactNode;
  initialUser?: CurrentUser | null;
}

export function CurrentUserProvider({ children, initialUser = null }: ProviderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(initialUser);

  return (
    <CurrentUserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within CurrentUserProvider');
  return ctx;
}

export default CurrentUserContext;
