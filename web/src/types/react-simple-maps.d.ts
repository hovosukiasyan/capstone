declare module 'react-simple-maps' {
  import * as React from 'react';

  export interface ComposableMapProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projection?: string | ((...args: any[]) => any);
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  export const ComposableMap: React.FC<ComposableMapProps>;

  export interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    children?: React.ReactNode;
  }
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;

  export interface GeographiesProps {
    geography: unknown;
    children: (props: { geographies: GeoFeature[] }) => React.ReactNode;
  }
  export const Geographies: React.FC<GeographiesProps>;

  export interface GeoFeature {
    rsmKey: string;
    properties: Record<string, string>;
    [key: string]: unknown;
  }

  export interface GeographyProps {
    geography: GeoFeature;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onMouseMove?: (event: React.MouseEvent, feature: GeoFeature) => void;
    onMouseLeave?: () => void;
    onClick?: () => void;
  }
  export const Geography: React.FC<GeographyProps>;
}
