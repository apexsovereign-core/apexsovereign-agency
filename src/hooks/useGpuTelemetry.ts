/**
 * ApexSovereign.ai - Dedicated WebSocket GPU Telemetry Hook (src/hooks/useGpuTelemetry.ts)
 * Autonomous Enterprise Work OS & Sovereign Compute Broker Platform.
 *
 * Real-time telemetry streaming over /ws/gpu-metrics with dynamic protocol resolution,
 * sliding 20-tick buffer, and 3000ms auto-reconnection resilience.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface TelemetryMetric {
  gpu_model: string;
  utilization_pct: number;
  temperature_c: number;
  memory_used_gb: number;
  memory_total_gb: number;
  timestamp: string;
}

export type TelemetryConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface UseGpuTelemetryReturn {
  metrics: TelemetryMetric[];
  currentMetric: TelemetryMetric | null;
  isConnected: boolean;
  isReconnecting: boolean;
  connectionStatus: TelemetryConnectionStatus;
  reconnect: () => void;
}

export function useGpuTelemetry(): UseGpuTelemetryReturn {
  const [metrics, setMetrics] = useState<TelemetryMetric[]>([]);
  const [currentMetric, setCurrentMetric] = useState<TelemetryMetric | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<TelemetryConnectionStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearReconnectTimer();

    // Close any prior dangling socket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    // Protocol Awareness: Dynamically resolve wss:// or ws:// based on window.location.protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/gpu-metrics`;

    setConnectionStatus('reconnecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setConnectionStatus('connected');
        clearReconnectTimer();
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        try {
          const payload = JSON.parse(event.data);
          let newMetric: TelemetryMetric | null = null;

          // 1. Direct TelemetryMetric Schema
          if (payload && typeof payload.utilization_pct === 'number' && payload.gpu_model) {
            newMetric = {
              gpu_model: String(payload.gpu_model),
              utilization_pct: Number(payload.utilization_pct),
              temperature_c: Number(payload.temperature_c || 0),
              memory_used_gb: Number(payload.memory_used_gb || 0),
              memory_total_gb: Number(payload.memory_total_gb || 0),
              timestamp: payload.timestamp || new Date().toISOString(),
            };
          } 
          // 2. Telemetry Array Schema
          else if (payload && Array.isArray(payload.telemetry) && payload.telemetry.length > 0) {
            const t = payload.telemetry[0];
            newMetric = {
              gpu_model: String(t.gpu_model || 'NVIDIA H100 80GB SXM5'),
              utilization_pct: Number(t.utilization_pct || 0),
              temperature_c: Number(t.temperature_c || 0),
              memory_used_gb: Number(t.memory_used_gb || 0),
              memory_total_gb: Number(t.memory_total_gb || 640),
              timestamp: t.timestamp || new Date().toISOString(),
            };
          } 
          // 3. Cluster Nodes Array Schema
          else if (payload && Array.isArray(payload.nodes) && payload.nodes.length > 0) {
            const n = payload.nodes[0];
            newMetric = {
              gpu_model: n.gpuModel || n.gpu_model || 'NVIDIA H100 80GB SXM5',
              utilization_pct: Number(n.utilizationPct ?? n.utilization_pct ?? 0),
              temperature_c: Number(n.temperatureC ?? n.temperature_c ?? 0),
              memory_used_gb: Number(n.memoryUsedGb ?? n.memory_used_gb ?? 0),
              memory_total_gb: Number(n.memoryTotalGb ?? n.memory_total_gb ?? 640),
              timestamp: n.timestamp || payload.timestamp || new Date().toISOString(),
            };
          }

          if (newMetric) {
            setCurrentMetric(newMetric);
            // State & Memory Buffer: Maintain the last 20 telemetry ticks in a sliding array
            setMetrics((prev) => {
              const updated = [...prev, newMetric!];
              return updated.slice(-20);
            });
          }
        } catch (err) {
          console.warn('[useGpuTelemetry] Telemetry parse error:', err);
        }
      };

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        setConnectionStatus('reconnecting');
      };

      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        setConnectionStatus('reconnecting');
        wsRef.current = null;
        // Resilience: Automatically attempt reconnection every 3000ms
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (err) {
      setConnectionStatus('reconnecting');
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, []);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    metrics,
    currentMetric,
    isConnected: connectionStatus === 'connected',
    isReconnecting: connectionStatus === 'reconnecting',
    connectionStatus,
    reconnect,
  };
}
