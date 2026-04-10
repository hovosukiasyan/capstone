'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';
import { geoMercator } from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import { normalizeMarzName, formatPct } from '@/lib/utils';
import type { ChoroplethRow } from '@/lib/types';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 560;
// 24px padding on each side so Armenia doesn't touch SVG edges
const PADDING = 24;

interface Props {
  data: ChoroplethRow[];
  indicator: string;
  colorScheme?: 'warm' | 'cool';
  onRegionClick?: (marz: string) => void;
  selectedMarz?: string | null;
}

export default function ChoroplethMap({
  data, indicator, colorScheme = 'warm', onRegionClick, selectedMarz,
}: Props) {
  const [geoData, setGeoData] = useState<object | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; marz: string; value: number | null } | null>(null);

  useEffect(() => {
    fetch('/armenia.geojson')
      .then((r) => r.json())
      .then((gj) => {
        for (const feat of gj.features) {
          feat.properties.marz = normalizeMarzName(feat.properties.shapeName ?? feat.properties.marz ?? '');

          // The GeoJSON ships with clockwise exterior rings (violates RFC 7946).
          // d3-geo's spherical algorithms treat CW exterior rings as the exterior
          // of the polygon (world minus shape), rendering each marz inverted.
          // Reverse exterior rings to CCW so they render as filled shapes.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const geom = feat.geometry as any;
          if (geom.type === 'Polygon') {
            geom.coordinates[0].reverse();
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((poly: number[][][]) => poly[0].reverse());
          }
        }
        setGeoData(gj);
      });
  }, []);

  // Compute a geoMercator projection that exactly fits all 11 marzes within the SVG.
  // react-simple-maps accepts a d3 projection object (it's a function) via the `projection` prop.
  const fittedProjection = useMemo(() => {
    if (!geoData) return null;
    return geoMercator().fitExtent(
      [[PADDING, PADDING], [MAP_WIDTH - PADDING, MAP_HEIGHT - PADDING]],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geoData as any
    );
  }, [geoData]);

  const normalizedData = data.map((d) => ({
    ...d,
    marz: normalizeMarzName(d.marz),
  }));
  const normalizedSelectedMarz = selectedMarz ? normalizeMarzName(selectedMarz) : null;

  const valueMap = new Map(normalizedData.map((d) => [d.marz, d.value]));
  const values = normalizedData.map((d) => d.value).filter((v): v is number => v !== null);
  const vMin = values.length ? Math.min(...values) : 0;
  const vMax = values.length ? Math.max(...values) : 1;

  const colorScale = scaleLinear<string>()
    .domain([vMin, vMax])
    .range(colorScheme === 'warm' ? ['#fef3c7', '#b91c1c'] : ['#dbeafe', '#1e40af']);

  const getColor = useCallback(
    (marz: string) => {
      const v = valueMap.get(marz);
      if (v === null || v === undefined) return '#e2e8f0';
      return colorScale(v);
    },
    [valueMap, colorScale]
  );

  const handleMouseMove = (e: React.MouseEvent, marz: string) => {
    setTooltip({
      x: e.clientX + 12,
      y: e.clientY - 28,
      marz,
      value: valueMap.get(marz) ?? null,
    });
  };

  const formatValue = (v: number | null) => {
    if (v === null) return 'N/A';
    if (['poverty_rate', 'extreme_poverty_rate'].includes(indicator)) return formatPct(v);
    if (indicator.includes('per_100k') || indicator.includes('per_10k')) return v.toFixed(2);
    return v.toFixed(3);
  };

  if (!geoData || !fittedProjection) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading map...
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <ComposableMap
        projection={fittedProjection}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const marz = normalizeMarzName(String(geo.properties.marz ?? ''));
              const isSelected = marz === normalizedSelectedMarz;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getColor(marz)}
                  stroke={isSelected ? '#1e40af' : '#fff'}
                  strokeWidth={isSelected ? 2 : 0.8}
                  style={{
                    default: { outline: 'none', cursor: 'pointer' },
                    hover: { outline: 'none', opacity: 0.85, cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseMove={(e: React.MouseEvent) => handleMouseMove(e, marz)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onRegionClick?.(marz)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Color legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 rounded-lg p-3 shadow text-xs">
        <div className="mb-1 font-medium text-slate-600">Scale</div>
        <div className="flex items-center gap-2">
          <div
            className="w-24 h-3 rounded"
            style={{
              background: colorScheme === 'warm'
                ? 'linear-gradient(to right, #fef3c7, #b91c1c)'
                : 'linear-gradient(to right, #dbeafe, #1e40af)',
            }}
          />
          <div className="flex justify-between w-24 text-slate-400">
            <span>{formatValue(vMin)}</span>
            <span>{formatValue(vMax)}</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-semibold">{tooltip.marz}</div>
          <div className="text-slate-300">{formatValue(tooltip.value)}</div>
        </div>
      )}
    </div>
  );
}
