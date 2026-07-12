import { useState, useEffect, useRef, useMemo, useCallback } from "react";

interface WorkerNode {
  id: string;
  label: string;
  color: string;
  glowColor: string;
  x: number;
  y: number;
  active: boolean;
}

interface Particle {
  id: string;
  fromNode: string;
  toNode: string;
  progress: number;
  color: string;
  direction: "outward" | "inward";
}

interface NeuralOrchestrationProps {
  activeWorkers?: string[];
  currentStep?: string;
  isProcessing?: boolean;
}

const WORKER_CONFIGS: Record<string, { label: string; color: string; glowColor: string }> = {
  captain: { label: "Captain Q", color: "#6366f1", glowColor: "rgba(99, 102, 241, 0.6)" },
  builder: { label: "Builder", color: "#3b82f6", glowColor: "rgba(59, 130, 246, 0.6)" },
  validator: { label: "Validator", color: "#10b981", glowColor: "rgba(16, 185, 129, 0.6)" },
  research: { label: "Research", color: "#8b5cf6", glowColor: "rgba(139, 92, 246, 0.6)" },
  artist: { label: "Artist", color: "#f59e0b", glowColor: "rgba(245, 158, 11, 0.6)" },
  browser: { label: "Browser", color: "#06b6d4", glowColor: "rgba(6, 182, 212, 0.6)" },
  executor: { label: "Executor", color: "#f97316", glowColor: "rgba(249, 115, 22, 0.6)" },
};

export function NeuralOrchestration({ activeWorkers = [], currentStep, isProcessing = false }: NeuralOrchestrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate node positions in a circle around captain
  const nodes = useMemo(() => {
    const centerX = 50;
    const centerY = 50;
    const radius = 35;
    const workerIds = ["builder", "validator", "research", "artist", "browser", "executor"];

    const result: WorkerNode[] = [
      {
        id: "captain",
        label: "Captain Q",
        color: WORKER_CONFIGS.captain.color,
        glowColor: WORKER_CONFIGS.captain.glowColor,
        x: centerX,
        y: centerY,
        active: isProcessing,
      },
    ];

    workerIds.forEach((id, i) => {
      const angle = (i * 2 * Math.PI) / workerIds.length - Math.PI / 2;
      const config = WORKER_CONFIGS[id];
      result.push({
        id,
        label: config.label,
        color: config.color,
        glowColor: config.glowColor,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        active: activeWorkers.includes(id),
      });
    });

    return result;
  }, [activeWorkers, isProcessing]);

  // Particle animation
  useEffect(() => {
    if (!isProcessing) {
      setParticles([]);
      return;
    }

    let particleId = 0;
    const interval = setInterval(() => {
      activeWorkers.forEach((workerId) => {
        const config = WORKER_CONFIGS[workerId];
        if (config) {
          particleId++;
          setParticles((prev) => [
            ...prev.slice(-20), // Keep max 20 particles
            {
              id: `p-${particleId}`,
              fromNode: "captain",
              toNode: workerId,
              progress: 0,
              color: config.color,
              direction: Math.random() > 0.4 ? "outward" : "inward",
            },
          ]);
        }
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isProcessing, activeWorkers]);

  // Animate particles — use a ref to avoid triggering re-renders on every frame
  const particlesRef = useRef<Particle[]>([]);
  const lastFrameTime = useRef<number>(0);

  // Keep particlesRef in sync with state
  useEffect(() => {
    particlesRef.current = particles;
  }, [particles]);

  const animate = useCallback((timestamp: number) => {
    // Throttle to ~30fps to avoid excessive re-renders
    if (timestamp - lastFrameTime.current >= 33) {
      lastFrameTime.current = timestamp;
      const updated = particlesRef.current
        .map((p) => ({ ...p, progress: p.progress + 0.025 }))
        .filter((p) => p.progress < 1);
      // Only call setState if there are particles to animate
      if (updated.length > 0 || particlesRef.current.length > 0) {
        setParticles(updated);
      }
    }
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [animate]);

  const getNodeById = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[200px]">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={{ filter: "drop-shadow(0 0 2px rgba(99, 102, 241, 0.2))" }}
      >
        {/* Connection lines from captain to each worker */}
        {nodes.slice(1).map((node) => {
          const captain = nodes[0];
          const isActive = node.active;
          return (
            <line
              key={`line-${node.id}`}
              x1={captain.x}
              y1={captain.y}
              x2={node.x}
              y2={node.y}
              stroke={isActive ? node.color : "rgba(100, 116, 139, 0.2)"}
              strokeWidth={isActive ? 0.4 : 0.15}
              className={isActive ? "animate-pulse" : ""}
              style={{
                filter: isActive ? `drop-shadow(0 0 3px ${node.glowColor})` : "none",
                transition: "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          );
        })}

        {/* Particles */}
        {particles.map((particle) => {
          const from = getNodeById(particle.direction === "outward" ? particle.fromNode : particle.toNode);
          const to = getNodeById(particle.direction === "outward" ? particle.toNode : particle.fromNode);
          if (!from || !to) return null;

          const x = from.x + (to.x - from.x) * particle.progress;
          const y = from.y + (to.y - from.y) * particle.progress;
          const opacity = particle.progress < 0.1 ? particle.progress * 10 : particle.progress > 0.9 ? (1 - particle.progress) * 10 : 1;

          return (
            <circle
              key={particle.id}
              cx={x}
              cy={y}
              r={0.8}
              fill={particle.color}
              opacity={opacity}
              style={{ filter: `drop-shadow(0 0 2px ${particle.color})` }}
            />
          );
        })}

        {/* Worker nodes */}
        {nodes.map((node) => {
          const isCenter = node.id === "captain";
          const nodeRadius = isCenter ? 5 : 3.5;

          return (
            <g key={node.id}>
              {/* Outer glow ring for active nodes */}
              {node.active && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius + 1.5}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={0.3}
                  opacity={0.5}
                  className="animate-ping"
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                />
              )}

              {/* Node background */}
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeRadius}
                fill={node.active ? node.color : "rgba(30, 30, 50, 0.9)"}
                stroke={node.color}
                strokeWidth={node.active ? 0.5 : 0.3}
                style={{
                  filter: node.active ? `drop-shadow(0 0 4px ${node.glowColor})` : "none",
                  transition: "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              />

              {/* Node label */}
              <text
                x={node.x}
                y={isCenter ? node.y + 8.5 : node.y + 6}
                textAnchor="middle"
                fill={node.active ? node.color : "rgba(148, 163, 184, 0.7)"}
                fontSize={isCenter ? 2.5 : 2}
                fontWeight={isCenter ? "bold" : "normal"}
                style={{ transition: "fill 0.3s ease" }}
              >
                {node.label}
              </text>

              {/* Center icon for captain */}
              {isCenter && (
                <text
                  x={node.x}
                  y={node.y + 1.5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={4}
                  fontWeight="bold"
                >
                  Q
                </text>
              )}

              {/* Worker icon (first letter) */}
              {!isCenter && (
                <text
                  x={node.x}
                  y={node.y + 1.2}
                  textAnchor="middle"
                  fill={node.active ? "white" : node.color}
                  fontSize={2.8}
                  fontWeight="bold"
                  style={{ transition: "fill 0.3s ease" }}
                >
                  {node.label[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Current step indicator */}
      {currentStep && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-xs text-indigo-300 backdrop-blur-sm whitespace-nowrap">
          {currentStep}
        </div>
      )}
    </div>
  );
}
