import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Search, FileCode2, LayoutDashboard, Cloud, Zap, Shield, Sliders, Settings, BookOpen, BrainCircuit, History } from 'lucide-react';
import { cn } from '@/utils/cn';

const ROUTES = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations', path: '/dashboard/integrations', icon: <Cloud className="w-4 h-4" /> },
    { id: 'resources', label: 'Resource Explorer', path: '/dashboard/resources', icon: <Search className="w-4 h-4" /> },
    { id: 'orphaned', label: 'Waste Radar', path: '/dashboard/orphaned', icon: <FileCode2 className="w-4 h-4" /> },
    { id: 'iac-drift', label: 'IaC Drift', path: '/dashboard/iac-drift', icon: <Shield className="w-4 h-4" /> },
    { id: 'features', label: 'Features Control', path: '/dashboard/features', icon: <Sliders className="w-4 h-4" /> },
    { id: 'optimizations', label: 'Optimizations', path: '/dashboard/optimizations', icon: <Zap className="w-4 h-4" /> },
    { id: 'copilot', label: 'Copilot AI', path: '/dashboard/copilot', icon: <BrainCircuit className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', path: '/dashboard/settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'docs', label: 'Documentation', path: '/dashboard/docs', icon: <BookOpen className="w-4 h-4" /> },
];

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [recentPaths, setRecentPaths] = useState<string[]>([]);
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem('aetherfin-recent-nav');
        if (stored) {
            try {
                setRecentPaths(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse recent paths', e);
            }
        }
    }, []);

    const handleNavigate = (path: string) => {
        const updated = [path, ...recentPaths.filter(p => p !== path)].slice(0, 5);
        setRecentPaths(updated);
        localStorage.setItem('aetherfin-recent-nav', JSON.stringify(updated));
        navigate(path);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen((open) => !open);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getRecentRoutes = () => {
        return recentPaths.map(p => ROUTES.find(r => r.path === p)).filter(Boolean) as typeof ROUTES;
    };

    const isSearching = query.length > 0;

    const filteredRoutes = isSearching
        ? ROUTES.filter(route => route.label.toLowerCase().includes(query.toLowerCase()))
        : getRecentRoutes().length > 0 ? getRecentRoutes() : ROUTES;

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        setQuery('');
        setSelectedIndex(0);
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % filteredRoutes.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + filteredRoutes.length) % filteredRoutes.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredRoutes.length > 0) {
                handleNavigate(filteredRoutes[selectedIndex].path);
            }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="relative w-full max-w-xl bg-brand-surface border border-brand-border-strong rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
                    >
                        <div className="flex items-center px-4 py-3 border-b border-brand-border-strong gap-3">
                            <Search className="w-5 h-5 text-brand-text/50" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search pages... (e.g. settings)"
                                className="flex-1 bg-transparent border-none outline-none text-brand-content text-sm placeholder:text-brand-text/40"
                            />
                            <div className="px-2 py-1 bg-brand-content/5 rounded text-[10px] font-bold text-brand-text/50 border border-brand-content/10">ESC</div>
                        </div>
                        {!isSearching && getRecentRoutes().length > 0 && (
                            <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-brand-text/40 uppercase tracking-widest flex items-center gap-1.5">
                                <History className="w-3 h-3" /> Recent
                            </div>
                        )}
                        <div className="max-h-[300px] overflow-y-auto py-2">
                            {filteredRoutes.length > 0 ? (
                                filteredRoutes.map((route, idx) => (
                                    <div
                                        key={route.id}
                                        onClick={() => handleNavigate(route.path)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={cn(
                                            "px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors",
                                            selectedIndex === idx ? "bg-indigo-500/10 text-indigo-400" : "text-brand-text/70 hover:bg-brand-content/5"
                                        )}
                                    >
                                        <div className={cn(
                                            "flex items-center justify-center w-8 h-8 rounded-xl",
                                            selectedIndex === idx ? "bg-indigo-500/20 text-indigo-400" : "bg-brand-content/5 text-brand-text/50"
                                        )}>
                                            {route.icon}
                                        </div>
                                        <span className={cn(
                                            "text-sm font-medium",
                                            selectedIndex === idx ? "text-brand-content" : ""
                                        )}>{route.label}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center text-brand-text/50 text-sm">
                                    No results found for "{query}"
                                </div>
                            )}
                        </div>
                        <div className="px-4 py-2 border-t border-brand-border-strong flex items-center justify-between bg-brand-content/5">
                            <div className="flex items-center gap-4 text-[10px] text-brand-text/50">
                                <span className="flex items-center gap-1">
                                    <span className="px-1.5 py-0.5 bg-brand-content/10 rounded border border-brand-content/10">↑</span>
                                    <span className="px-1.5 py-0.5 bg-brand-content/10 rounded border border-brand-content/10">↓</span>
                                    to navigate
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="px-1.5 py-0.5 bg-brand-content/10 rounded border border-brand-content/10">↵</span>
                                    to select
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
