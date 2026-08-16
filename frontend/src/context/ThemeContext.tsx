import React, { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light' | 'royal-purple' | 'royal-blue' | 'royal-gold';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('aetherfin-theme');
        if (savedTheme) {
            return savedTheme as Theme;
        }
        return 'dark'; // Default theme
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.setAttribute('data-theme', theme);
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem('aetherfin-theme', newTheme);

        if (!document.startViewTransition) {
            setThemeState(newTheme);
            return;
        }

        document.startViewTransition(() => {
            flushSync(() => {
                setThemeState(newTheme);
            });
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

