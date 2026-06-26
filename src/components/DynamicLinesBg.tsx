import React, { useEffect, useRef } from "react";
import { useAnimationOptOut } from "../lib/useAnimationOptOut";

interface DynamicLinesBgProps {
  theme: "dark" | "light";
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  waveIndex: number;
  offsetY: number;
  alpha: number;
}

interface FloatingFormula {
  text: string;
  label: string;
  x: number;
  y: number;
  alpha: number;
  targetAlpha: number;
  state: "fadeIn" | "visible" | "fadeOut" | "idle";
  timer: number;
}

const EQUATIONS = [
  { text: "iℏ ∂/∂t Ψ = ĤΨ", label: "Quantum Wavefront" },
  { text: "G_μν + Λg_μν = 8πG/c⁴ T_μν", label: "Topological Spacetime" },
  { text: "∇ · E = ρ / ε₀", label: "Electrodynamics" },
  { text: "ρ(∂u/∂t + u · ∇u) = -∇p + μ∇²u + f", label: "Fluid Vector Solver" },
  { text: "d/dt(∂L/∂q̇_i) - ∂L/∂q_i = 0", label: "Analytical Dynamics" },
  { text: "x_new = 2x - x_old + a · Δt²", label: "Kinetic Integration" },
  { text: "F(ω) = ∫ f(t) e^(-iωt) dt", label: "Frequency Transform" },
  { text: "E_n = (n + 1/2) ℏ ω", label: "Harmonic Oscillator" }
];

export default function DynamicLinesBg({ theme }: DynamicLinesBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000 });
  const { paused } = useAnimationOptOut();
  // Mirror the live opt-out flag into a ref so the rAF closure can read the
  // current value without re-subscribing (the effect runs once per `theme`).
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Wave config (restrained, high-end contours)
    const numWaves = 4;
    const waves = Array.from({ length: numWaves }, (_, i) => ({
      yBase: height * (0.25 + i * 0.18),
      amplitude: 25 + i * 15,
      frequency: 0.0012 + i * 0.0006,
      phase: i * (Math.PI / 3),
      speed: 0.012 - i * 0.002,
      thickness: 0.8 + (numWaves - i) * 0.3,
    }));

    // Particle flow traces along wave contours
    const particles: Particle[] = [];
    const numParticles = 35;
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: 0,
        speed: 0.4 + Math.random() * 0.7,
        size: Math.random() * 1.5 + 0.5,
        waveIndex: Math.floor(Math.random() * numWaves),
        offsetY: (Math.random() - 0.5) * 12,
        alpha: 0.15 + Math.random() * 0.4,
      });
    }

    // Initialize floating formulas
    const numFormulas = 3;
    const activeFormulas: FloatingFormula[] = [];

    for (let i = 0; i < numFormulas; i++) {
      const eq = EQUATIONS[Math.floor(Math.random() * EQUATIONS.length)];
      activeFormulas.push({
        text: eq.text,
        label: eq.label,
        x: Math.random() * (width - 320) + 40,
        y: Math.random() * (height - 140) + 70,
        alpha: 0,
        targetAlpha: 0,
        state: "idle",
        timer: Math.random() * 180,
      });
    }

    // Handle Resize
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      
      // Re-map wave base lines
      waves.forEach((wave, i) => {
        wave.yBase = height * (0.25 + i * 0.18);
      });
    };
    window.addEventListener("resize", handleResize);

    // Track mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
    };
    const handleMouseLeave = () => {
      mouseRef.current.targetX = -1000;
      mouseRef.current.targetY = -1000;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    // Draw Loop
    const draw = () => {
      // While paused (tab hidden or reduced-motion), keep the last painted
      // frame on the canvas and skip all redraw work — no flicker, no wasted
      // CPU/GPU. The loop keeps scheduling frames so resume is automatic.
      if (pausedRef.current) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smooth mouse transition
      const mouse = mouseRef.current;
      if (mouse.targetX !== -1000) {
        if (mouse.x === -1000) {
          mouse.x = mouse.targetX;
          mouse.y = mouse.targetY;
        } else {
          mouse.x += (mouse.targetX - mouse.x) * 0.08;
          mouse.y += (mouse.targetY - mouse.y) * 0.08;
        }
      } else {
        mouse.x = -1000;
        mouse.y = -1000;
      }

      const isDark = theme === "dark";

      // Draw subtle background architectural coordinate ticks (Vercel-meets-high-fashion look)
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.015)" : "rgba(0, 0, 0, 0.02)";
      ctx.lineWidth = 1;
      
      // vertical grid lines with high-end tick accents
      const gridSpacing = 160;
      for (let x = 0; x < width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // draw tiny ticks
        if (isDark) {
          ctx.fillStyle = "rgba(188, 253, 73, 0.08)";
          ctx.fillRect(x - 2, 40, 4, 1);
          ctx.fillRect(x - 2, height - 40, 4, 1);
        }
      }

      // Draw continuous vector waves
      waves.forEach((wave, waveIdx) => {
        wave.phase += wave.speed;

        ctx.beginPath();
        
        // Render horizontal path segment-by-segment for continuous sine wave distortion
        const pointsCount = 45;
        const segmentWidth = width / pointsCount;
        
        for (let i = 0; i <= pointsCount; i++) {
          const x = i * segmentWidth;
          
          // Calculate natural mathematical wave displacement
          let y = wave.yBase + Math.sin(x * wave.frequency + wave.phase) * wave.amplitude;
          y += Math.cos(x * (wave.frequency * 1.8) - wave.phase * 0.5) * (wave.amplitude * 0.35);

          // Interactive mouse gravity: the waves gracefully wrap/curver around the cursor!
          if (mouse.x !== -1000) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 220) {
              const push = (220 - dist) / 220;
              // graceful push up or down depending on mouse position relative to wave base
              const directionY = dy > 0 ? 1 : -1;
              y += directionY * push * 40 * Math.sin((dist / 220) * Math.PI);
            }
          }

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Draw the wave as an ultra-high-end subtle neon gradient path
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        if (isDark) {
          grad.addColorStop(0, "rgba(255, 255, 255, 0.02)");
          grad.addColorStop(0.3, "rgba(188, 253, 73, 0.07)"); // stylish neon cyber-lime accent
          grad.addColorStop(0.7, "rgba(188, 253, 73, 0.15)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.02)");
        } else {
          grad.addColorStop(0, "rgba(15, 23, 42, 0.01)");
          grad.addColorStop(0.5, "rgba(188, 253, 73, 0.18)");
          grad.addColorStop(1, "rgba(15, 23, 42, 0.02)");
        }

        ctx.strokeStyle = grad;
        ctx.lineWidth = wave.thickness;
        ctx.stroke();
      });

      // Update & Draw flowing particles along wave vectors
      particles.forEach((p) => {
        p.x += p.speed;
        if (p.x > width + 10) {
          p.x = -10;
          p.waveIndex = Math.floor(Math.random() * numWaves);
          p.alpha = 0.15 + Math.random() * 0.45;
        }

        const wave = waves[p.waveIndex];
        let targetY = wave.yBase + Math.sin(p.x * wave.frequency + wave.phase) * wave.amplitude + p.offsetY;
        targetY += Math.cos(p.x * (wave.frequency * 1.8) - wave.phase * 0.5) * (wave.amplitude * 0.35);

        // Interact with mouse
        if (mouse.x !== -1000) {
          const dx = p.x - mouse.x;
          const dy = targetY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            const push = (180 - dist) / 180;
            const directionY = dy > 0 ? 1 : -1;
            targetY += directionY * push * 30;
          }
        }

        // Drifting motion
        ctx.fillStyle = isDark 
          ? `rgba(188, 253, 73, ${p.alpha * 0.75})` 
          : `rgba(188, 253, 73, ${p.alpha * 0.9})`;
        
        ctx.beginPath();
        ctx.arc(p.x, targetY, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Update & Draw Floating Formulas in Minimalist Elegant Style
      activeFormulas.forEach((formula) => {
        formula.timer--;

        if (formula.state === "idle" && formula.timer <= 0) {
          const eq = EQUATIONS[Math.floor(Math.random() * EQUATIONS.length)];
          formula.text = eq.text;
          formula.label = eq.label;
          formula.x = Math.random() * (width - 340) + 40;
          formula.y = Math.random() * (height - 160) + 80;
          formula.state = "fadeIn";
          formula.targetAlpha = isDark ? 0.35 : 0.25;
        }

        if (formula.state === "fadeIn") {
          formula.alpha += 0.0035;
          if (formula.alpha >= formula.targetAlpha) {
            formula.alpha = formula.targetAlpha;
            formula.state = "visible";
            formula.timer = 220 + Math.random() * 250;
          }
        } else if (formula.state === "visible") {
          if (formula.timer <= 0) {
            formula.state = "fadeOut";
            formula.targetAlpha = 0;
          }
        } else if (formula.state === "fadeOut") {
          formula.alpha -= 0.0035;
          if (formula.alpha <= 0) {
            formula.alpha = 0;
            formula.state = "idle";
            formula.timer = 160 + Math.random() * 260;
          }
        }

        if (formula.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = formula.alpha;

          // Technical proof identifier (acid-lime accent color)
          ctx.font = '500 9px "JetBrains Mono", monospace';
          ctx.fillStyle = "#bcfd49"; // Young, high-end acid-lime color
          ctx.fillText(`// COMPUTE_FIELD: ${formula.label.toUpperCase()}`, formula.x, formula.y - 12);

          // Mathematical text line
          ctx.font = '400 12px "JetBrains Mono", monospace';
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(15, 23, 42, 0.85)";
          ctx.fillText(formula.text, formula.x + 8, formula.y + 8);

          // Minimal corner lines (restrained visual structure)
          ctx.strokeStyle = "rgba(188, 253, 73, 0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(formula.x, formula.y - 6);
          ctx.lineTo(formula.x, formula.y + 14);
          ctx.stroke();

          ctx.restore();
        }
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10 w-full h-full"
      style={{ opacity: theme === "dark" ? 0.95 : 0.65 }}
      id="dynamic-lines-canvas"
    />
  );
}
