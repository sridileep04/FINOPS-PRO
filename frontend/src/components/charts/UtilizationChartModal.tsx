import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { X } from 'lucide-react';

interface Point { timestamp: string; average: number; maximum: number; minimum: number; }

export function UtilizationChartModal({ resourceId, resourceName, onClose }: { resourceId: string; resourceName: string; onClose: () => void }) {
    const { token } = useAuth();
    const [range, setRange] = useState<'15d' | 'since_creation'>('15d');
    const [points, setPoints] = useState<Point[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        fetch(`/api/v1/resources/${encodeURIComponent(resourceId)}/utilization?range=${range}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json())
            .then((data) => setPoints(Array.isArray(data.points) ? data.points : []))
            .finally(() => setLoading(false));
    }, [token, resourceId, range]);

    const chartData = points.map((p) => ({
        time: new Date(p.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
        avg: p.average, max: p.maximum, min: p.minimum,
    }));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-brand-surface border border-brand-content/10 rounded-xl w-full max-w-3xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-bold text-brand-content">CPU Utilization</h3>
                        <p className="text-xs text-brand-content/50 font-mono">{resourceName}</p>
                    </div>
                    <button onClick={onClose} className="text-brand-content/40 hover:text-brand-content"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setRange('15d')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === '15d' ? 'bg-indigo-600 text-white' : 'bg-brand-base text-brand-content/60'}`}
                    >
                        Last 15 Days
                    </button>
                    <button
                        onClick={() => setRange('since_creation')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === 'since_creation' ? 'bg-indigo-600 text-white' : 'bg-brand-base text-brand-content/60'}`}
                    >
                        Since Created
                    </button>
                </div>

                <div className="h-72">
                    {loading ? (
                        <div className="h-full flex items-center justify-center text-brand-content/40 text-sm">Loading...</div>
                    ) : chartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-brand-content/40 text-sm">
                            No utilization history collected for this range yet.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} unit="%" />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="avg" stroke="#6366f1" dot={false} name="Avg CPU %" />
                                <Line type="monotone" dataKey="max" stroke="#f59e0b" dot={false} name="Max CPU %" strokeDasharray="4 2" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
}