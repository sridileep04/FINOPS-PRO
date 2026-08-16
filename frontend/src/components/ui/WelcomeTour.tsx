import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Cloud, Zap, Shield, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

interface TourStep {
    id: number;
    title: string;
    description: string;
    icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
    {
        id: 1,
        title: "Welcome to AetherFin",
        description: "Your autonomous cloud cost intelligence platform. We help you uncover invisible infrastructure costs and optimize your cloud spend with precision.",
        icon: <Zap className="w-8 h-8 text-indigo-400" />
    },
    {
        id: 2,
        title: "Connect Your First Cloud",
        description: "Navigate to the Integrations tab to securely link your AWS, GCP, or Azure environments using read-only cross-account roles.",
        icon: <Cloud className="w-8 h-8 text-indigo-400" />
    },
    {
        id: 3,
        title: "Secure & Automated",
        description: "Once connected, our engine automatically detects orphaned resources, IaC drift, and cost anomalies without touching your production data.",
        icon: <Shield className="w-8 h-8 text-indigo-400" />
    }
];

export function WelcomeTour() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const tourCompleted = localStorage.getItem('aetherfin-tour-completed');
        if (!tourCompleted) {
            // Small delay to let the app load first
            const timer = setTimeout(() => {
                setIsOpen(true);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const completeTour = () => {
        localStorage.setItem('aetherfin-tour-completed', 'true');
        setIsOpen(false);
    };

    const nextStep = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            completeTour();
        }
    };

    const skipTour = () => {
        completeTour();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={skipTour}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-brand-surface border border-brand-border-strong rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-brand-border-strong flex items-center justify-between">
                            <div className="text-xs font-bold text-brand-content tracking-wide uppercase">
                                Getting Started
                            </div>
                            <button
                                onClick={skipTour}
                                className="text-brand-text/50 hover:text-brand-content transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="p-8 relative min-h-[220px] flex flex-col items-center justify-center text-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col items-center"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-brand-content/5 border border-brand-content/10 flex items-center justify-center mb-6">
                                        {TOUR_STEPS[currentStep].icon}
                                    </div>
                                    <h3 className="text-xl font-bold text-brand-content mb-3">
                                        {TOUR_STEPS[currentStep].title}
                                    </h3>
                                    <p className="text-sm text-brand-text/70 leading-relaxed max-w-[280px]">
                                        {TOUR_STEPS[currentStep].description}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Footer / Controls */}
                        <div className="px-6 py-4 bg-brand-content/5 border-t border-brand-border-strong flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {TOUR_STEPS.map((step, idx) => (
                                    <div
                                        key={step.id}
                                        className={cn(
                                            "w-2 h-2 rounded-full transition-all duration-300",
                                            idx === currentStep
                                                ? "bg-indigo-500 w-4"
                                                : idx < currentStep
                                                    ? "bg-indigo-500/50"
                                                    : "bg-brand-content/20"
                                        )}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={skipTour}
                                    className="text-xs font-semibold text-brand-text/60 hover:text-brand-content transition-colors cursor-pointer"
                                >
                                    Skip
                                </button>
                                <button
                                    onClick={nextStep}
                                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    {currentStep === TOUR_STEPS.length - 1 ? (
                                        <>Get Started <Check className="w-3.5 h-3.5" /></>
                                    ) : (
                                        <>Next <ChevronRight className="w-3.5 h-3.5" /></>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
