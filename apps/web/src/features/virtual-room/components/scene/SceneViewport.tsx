'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSceneCameraStore } from '../../stores/scene-camera.store';
import { getCameraTransformCss } from '../../engine/camera-transform';

interface SceneViewportProps {
  children: React.ReactNode;
  className?: string;
}

export function SceneViewport({
  children,
  className,
}: SceneViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const touchDistanceRef = useRef<number | null>(null);

  const {
    x,
    y,
    zoom,
    minZoom,
    maxZoom,
    mode,
    panBy,
    zoomBy,
    setZoom,
    resetCamera,
    setMode,
    isDragging,
    setIsDragging,
  } = useSceneCameraStore();

  // Support URL query parameter for zoom initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const zoomParam = params.get('zoom');
      if (zoomParam) {
        const val = parseFloat(zoomParam);
        if (!isNaN(val) && val >= minZoom && val <= maxZoom) {
          setZoom(val);
        }
      }
    }
  }, [minZoom, maxZoom, setZoom]);

  // Mouse Drag Panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only initiate pan on left click or middle click
      if (e.button !== 0 && e.button !== 1) return;
      dragOriginRef.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
    },
    [setIsDragging]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragOriginRef.current) return;
      const dx = e.clientX - dragOriginRef.current.x;
      const dy = e.clientY - dragOriginRef.current.y;
      dragOriginRef.current = { x: e.clientX, y: e.clientY };
      panBy(dx, dy);
    },
    [panBy]
  );

  const handleMouseUp = useCallback(() => {
    dragOriginRef.current = null;
    setIsDragging(false);
  }, [setIsDragging]);

  // Mouse Wheel Zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Smooth zoom delta
      const zoomDelta = -e.deltaY * 0.0015;
      zoomBy(zoomDelta);
    },
    [zoomBy]
  );

  // Touch Drag Pan & Pinch Zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && e.touches[0]) {
        dragOriginRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setIsDragging(true);
      } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
        // Pinch zoom initiation
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchDistanceRef.current = dist;
      }
    },
    [setIsDragging]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && e.touches[0] && dragOriginRef.current) {
        const dx = e.touches[0].clientX - dragOriginRef.current.x;
        const dy = e.touches[0].clientY - dragOriginRef.current.y;
        dragOriginRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        panBy(dx, dy);
      } else if (e.touches.length === 2 && e.touches[0] && e.touches[1] && touchDistanceRef.current !== null) {
        const newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const distDelta = (newDist - touchDistanceRef.current) * 0.005;
        touchDistanceRef.current = newDist;
        zoomBy(distDelta);
      }
    },
    [panBy, zoomBy]
  );

  const handleTouchEnd = useCallback(() => {
    dragOriginRef.current = null;
    touchDistanceRef.current = null;
    setIsDragging(false);
  }, [setIsDragging]);

  // Transform string for the world layer
  const cameraTransform = getCameraTransformCss({
    x,
    y,
    zoom,
    minZoom,
    maxZoom,
    mode,
  });

  return (
    <div
      ref={viewportRef}
      data-testid="scene-viewport"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'relative w-full h-full min-h-[460px] overflow-hidden bg-[#050711] select-none rounded-2xl border border-white/10 shadow-2xl',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
    >
      {/* Centered World Transform Container */}
      <div
        id="virtual-world-wrapper"
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          transform: cameraTransform,
          transformOrigin: '0 0',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
      >
        {children}
      </div>

      {/* On-Screen Camera HUD Controls */}
      <div
        data-testid="camera-hud-controls"
        className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 p-1 rounded-xl bg-[#0b0e19]/90 backdrop-blur-md border border-white/15 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Zoom Out Button */}
        <button
          type="button"
          data-testid="camera-zoom-out-btn"
          onClick={() => zoomBy(-0.25)}
          disabled={zoom <= minZoom}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Current Zoom Level Indicator */}
        <div
          data-testid="camera-zoom-badge"
          className="px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-200 min-w-[42px] text-center"
        >
          {`${zoom.toFixed(2)}x`}
        </div>

        {/* Zoom In Button */}
        <button
          type="button"
          data-testid="camera-zoom-in-btn"
          onClick={() => zoomBy(0.25)}
          disabled={zoom >= maxZoom}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Preset Zoom Levels */}
        {[1.0, 1.5, 2.0].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setZoom(preset)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors',
              Math.abs(zoom - preset) < 0.05
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
            title={`Set zoom to ${preset}x`}
          >
            {`${preset}x`}
          </button>
        ))}

        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Stage Focus Mode Toggle */}
        <button
          type="button"
          data-testid="camera-stage-focus-btn"
          onClick={() => setMode(mode === 'focus' ? 'default' : 'focus')}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all',
            mode === 'focus'
              ? 'bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white shadow-md'
              : 'bg-white/5 hover:bg-white/10 text-slate-300'
          )}
          title="Focus on Karaoke Stage"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden sm:inline">Stage</span>
        </button>

        {/* Reset Camera View Button */}
        <button
          type="button"
          data-testid="camera-reset-btn"
          onClick={resetCamera}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          title="Reset Camera View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Left Navigation Legend */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 pointer-events-none">
        <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>2.5D Social Lounge (S1 Engine)</span>
        </span>
      </div>
    </div>
  );
}
