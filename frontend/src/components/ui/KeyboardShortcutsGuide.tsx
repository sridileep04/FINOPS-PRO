import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Keyboard, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface Shortcut {
    keys: string[];
    description: string;
}

const SHORTCUTS: Shortcut[] = [
    { keys: ['⌘', 'K'], description: 'Open Command Palette' },
    { keys: ['?'], description: 'Show Keyboard Shortcuts' },
    { keys: ['ESC'], description: 'Close Modals' },
];

export function KeyboardShortcutsGuide() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if inside an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === '?' && !e.shiftKey) { // shift+? usually produces '?', so just match '?'
                e.preventDefault();
                setIsOpen((prev) => !prev);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="relative w-full max-w-md bg-brand-surface border border-brand-border-strong rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border-strong">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-content/5 text-brand-content/70">
                                    <Keyboard className="w-4 h-4" />
                                </div>
                                <h2 className="text-sm font-bold text-brand-content tracking-wide">Keyboard Shortcuts</h2>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 rounded-lg text-brand-content/50 hover:bg-brand-content/5 hover:text-brand-content transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4">
                            {SHORTCUTS.map((shortcut, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="text-sm text-brand-content/70">{shortcut.description}</span>
                                    <div className="flex items-center gap-1.5">
                                        {shortcut.keys.map((k, j) => (
                                            <span key={j} className="flex items-center justify-center min-w-[24px] h-6 px-1.5 text-[10px] font-bold text-brand-content/70 bg-brand-content/5 border border-brand-border-strong rounded shadow-sm">
                                                {k}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-3 bg-brand-content/5 border-t border-brand-border-strong text-[10px] text-brand-content/50 font-medium text-center">
                            Press ESC to close
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
