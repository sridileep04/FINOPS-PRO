import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            const sanitizedToken = storedToken.replace(/^"|"$/g, '').trim();
            setToken(sanitizedToken);
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) { }
        }
        setIsLoading(false);
    }, []);

    const login = (newToken: string, newUser: User) => {
        const trimmedToken = newToken.trim();
        setToken(trimmedToken);
        setUser(newUser);
        localStorage.setItem('token', trimmedToken);
        localStorage.setItem('user', JSON.stringify(newUser));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    };

    // Global fetch interceptor (src/utils/authFetchInterceptor.ts) dispatches
    // this event whenever any /api/* call comes back 401 -- e.g. an expired
    // JWT after the tab's been open a long time. Clearing auth state here
    // makes ProtectedRoute's `if (!user) return <Navigate to="/login" />`
    // kick in on the next render, with no per-page fetch changes needed.
    useEffect(() => {
        const handleUnauthorized = () => {
            logout();
        };
        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}