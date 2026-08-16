import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '@/context/ThemeContext';

interface Resource {
    id: string;
    name: string;
    provider: string;
    type: string;
    region: string;
    status: string;
    environment: string;
    mtdCost: number;
    estimatedMonthlyCost: number;
}

interface Props {
    resources: Resource[];
    height?: number;
}

export function ResourceDensityHeatmap({ resources, height = 300 }: Props) {
    const { theme } = useTheme();

    const option = useMemo(() => {
        // Group resources by Region -> Type -> Resource
        const regionMap = new Map<string, {
            value: number;
            children: Map<string, { value: number; children: { name: string; value: number }[] }>;
        }>();

        let maxCost = 0;

        resources.forEach(res => {
            const region = res.region || 'Unknown Region';
            const type = res.type || 'Unknown Type';
            const cost = res.estimatedMonthlyCost || 0;

            if (cost > maxCost) maxCost = cost;

            if (!regionMap.has(region)) {
                regionMap.set(region, { value: 0, children: new Map() });
            }

            const regionData = regionMap.get(region)!;
            regionData.value += cost;

            if (!regionData.children.has(type)) {
                regionData.children.set(type, { value: 0, children: [] });
            }

            const typeData = regionData.children.get(type)!;
            typeData.value += cost;
            typeData.children.push({
                name: res.name || res.id,
                value: cost
            });
        });

        const data = Array.from(regionMap.entries()).map(([regionName, regionData]) => ({
            name: regionName,
            value: regionData.value,
            children: Array.from(regionData.children.entries()).map(([typeName, typeData]) => ({
                name: typeName,
                value: typeData.value,
                children: typeData.children
            }))
        }));

        const isLight = theme === 'light';
        const textColor = isLight ? '#000000' : '#ffffff';
        const borderColor = isLight ? '#e2e8f0' : '#1a1a1a';

        // A nice gradient palette for costs
        const colorMapping = isLight ?
            ['#c7d2fe', '#818cf8', '#4f46e5', '#312e81'] :
            ['#1e1b4b', '#3730a3', '#4f46e5', '#818cf8'];

        return {
            tooltip: {
                formatter: function (info: any) {
                    const value = info.value;
                    const treePathInfo = info.treePathInfo;
                    const treePath = [];
                    for (let i = 1; i < treePathInfo.length; i++) {
                        treePath.push(treePathInfo[i].name);
                    }
                    return `
            <div style="font-family: inherit; font-size: 12px; font-weight: 500; color: ${textColor}; padding: 4px;">
              <div style="opacity: 0.7; font-size: 10px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;">
                ${treePath.join(' / ')}
              </div>
              <div style="font-size: 14px; font-weight: 700;">
                Est. Monthly Cost: <span style="color: #10b981;">$${value.toFixed(2)}</span>
              </div>
            </div>
          `;
                },
                backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 10, 0.95)',
                borderColor: borderColor,
                borderWidth: 1,
                textStyle: {
                    color: textColor
                },
                padding: 12,
                borderRadius: 8,
            },
            series: [
                {
                    name: 'Cluster Density',
                    type: 'treemap',
                    visibleMin: 300,
                    label: {
                        show: true,
                        formatter: '{b}'
                    },
                    upperLabel: {
                        show: true,
                        height: 30,
                        color: textColor,
                        backgroundColor: isLight ? '#f1f5f9' : '#0f0f0f',
                        borderColor: borderColor,
                        borderWidth: 1,
                        formatter: '{b}'
                    },
                    itemStyle: {
                        borderColor: isLight ? '#ffffff' : '#000000',
                        borderWidth: 2,
                        gapWidth: 2
                    },
                    levels: [
                        {
                            itemStyle: {
                                borderWidth: 0,
                                gapWidth: 4
                            }
                        },
                        {
                            color: colorMapping,
                            colorMappingBy: 'value',
                            itemStyle: {
                                gapWidth: 2,
                                borderColor: borderColor
                            }
                        },
                        {
                            colorSaturation: [0.3, 0.7],
                            itemStyle: {
                                gapWidth: 1,
                                borderColorSaturation: 0.6
                            }
                        }
                    ],
                    data: data
                }
            ]
        };
    }, [resources, theme]);

    return (
        <div style={{ height: `${height}px`, width: '100%' }}>
            <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
}
