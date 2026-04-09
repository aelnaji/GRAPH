'use client';

import { useEffect, useRef } from 'react';
import { useKnowledgeStore, type GraphNode, type GraphLink } from '@/store/knowledge-store';

// Parse rgb(r,g,b) or hex to {r,g,b}
function parseColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16) || 128,
      g: parseInt(hex.slice(2, 4), 16) || 128,
      b: parseInt(hex.slice(4, 6), 16) || 128,
    };
  }
  const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    return { r: +match[1], g: +match[2], b: +match[3] };
  }
  return { r: 128, g: 128, b: 128 };
}

function rgba(color: string, alpha: number): string {
  const c = parseColor(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export function KnowledgeGraphCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const hoverRef = useRef<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const setSelectedNode = useKnowledgeStore((s) => s.setSelectedNode);
  const nodes = useKnowledgeStore((s) => s.nodes);
  const links = useKnowledgeStore((s) => s.links);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { linksRef.current = links; }, [links]);

  const positions = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const canvasSize = useRef({ w: 800, h: 600 });

  // Initialize positions for new nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvasSize.current = { w: canvas.parentElement?.clientWidth || 800, h: canvas.parentElement?.clientHeight || 600 };

    for (const node of nodes) {
      if (!positions.current.has(node.id)) {
        positions.current.set(node.id, {
          x: Math.random() * canvasSize.current.w * 0.8 + canvasSize.current.w * 0.1,
          y: Math.random() * canvasSize.current.h * 0.8 + canvasSize.current.h * 0.1,
          vx: 0,
          vy: 0,
        });
      }
    }
  }, [nodes]);

  // Physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = parent.clientWidth + 'px';
      canvas.style.height = parent.clientHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvasSize.current = { w: parent.clientWidth, h: parent.clientHeight };
    };
    resize();
    window.addEventListener('resize', resize);

    function simulate() {
      timeRef.current += 0.016;
      const t = timeRef.current;
      const pos = positions.current;
      const nodeArr = nodesRef.current;
      const linkArr = linksRef.current;
      const W = canvasSize.current.w;
      const H = canvasSize.current.h;

      // --- Physics ---

      // Repulsion between all nodes
      for (let i = 0; i < nodeArr.length; i++) {
        const pi = pos.get(nodeArr[i].id);
        if (!pi) continue;
        for (let j = i + 1; j < nodeArr.length; j++) {
          const pj = pos.get(nodeArr[j].id);
          if (!pj) continue;
          let dx = pj.x - pi.x;
          let dy = pj.y - pi.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 1200 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          pi.vx -= fx;
          pi.vy -= fy;
          pj.vx += fx;
          pj.vy += fy;
        }
      }

      // Attraction along edges
      for (const link of linkArr) {
        const ps = pos.get(link.source);
        const pt = pos.get(link.target);
        if (!ps || !pt) continue;
        let dx = pt.x - ps.x;
        let dy = pt.y - ps.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = 140;
        const force = (dist - idealDist) * 0.002 * (link.weight || 0.5);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        ps.vx += fx;
        ps.vy += fy;
        pt.vx -= fx;
        pt.vy -= fy;
      }

      // Center gravity
      for (const node of nodeArr) {
        const p = pos.get(node.id);
        if (!p) continue;
        p.vx += (W / 2 - p.x) * 0.0005;
        p.vy += (H / 2 - p.y) * 0.0005;
      }

      // Update positions
      for (const node of nodeArr) {
        const p = pos.get(node.id);
        if (!p) continue;
        if (dragRef.current.nodeId === node.id) continue;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;
        p.x = Math.max(30, Math.min(W - 30, p.x));
        p.y = Math.max(30, Math.min(H - 30, p.y));
      }

      // --- Render ---
      ctx.clearRect(0, 0, W, H);

      // Draw background gradient
      const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, '#0d1117');
      bgGrad.addColorStop(0.5, '#080c12');
      bgGrad.addColorStop(1, '#030508');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)';
      ctx.lineWidth = 0.5;
      const gridSize = 60;
      for (let x = gridSize; x < W; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = gridSize; y < H; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Draw edges as curved arcs (Earth-like great circles)
      for (const link of linkArr) {
        const ps = pos.get(link.source);
        const pt = pos.get(link.target);
        if (!ps || !pt) continue;

        const dx = pt.x - ps.x;
        const dy = pt.y - ps.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) continue;

        // Calculate perpendicular offset for curve (like great circle on globe)
        // The curvature increases with distance
        const curvature = dist * 0.2;
        const midX = (ps.x + pt.x) / 2;
        const midY = (ps.y + pt.y) / 2;
        const nx = -dy / dist;
        const ny = dx / dist;
        const cpX = midX + nx * curvature;
        const cpY = midY + ny * curvature;

        // Edge color based on verification and weight
        let edgeColor: string;
        if (link.verified) {
          edgeColor = `rgba(34, 197, 94, ${0.15 + (link.weight || 0.5) * 0.2})`;
        } else {
          edgeColor = `rgba(148, 163, 184, ${0.05 + (link.weight || 0.5) * 0.12})`;
        }

        // Draw curved edge
        ctx.beginPath();
        ctx.moveTo(ps.x, ps.y);
        ctx.quadraticCurveTo(cpX, cpY, pt.x, pt.y);
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = Math.max(0.5, (link.weight || 0.5) * 2);
        ctx.stroke();

        // Draw animated particles along the curve for verified edges
        if (link.verified || (link.weight || 0) > 0.5) {
          const particleCount = link.verified ? 3 : 1;
          for (let p = 0; p < particleCount; p++) {
            const progress = ((t * 0.3 + p / particleCount) % 1);
            // Quadratic bezier point at parameter t
            const invT = 1 - progress;
            const px = invT * invT * ps.x + 2 * invT * progress * cpX + progress * progress * pt.x;
            const py = invT * invT * ps.y + 2 * invT * progress * cpY + progress * progress * pt.y;

            const particleGlow = ctx.createRadialGradient(px, py, 0, px, py, 3);
            particleGlow.addColorStop(0, link.verified ? 'rgba(74, 222, 128, 0.8)' : 'rgba(148, 163, 184, 0.5)');
            particleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = particleGlow;
            ctx.fill();
          }
        }
      }

      // Draw nodes as glowing orbs
      const hoveredId = hoverRef.current;
      for (const node of nodeArr) {
        const p = pos.get(node.id);
        if (!p) continue;

        const baseRadius = Math.max(4, Math.min(18, (node.confidence || 0.5) * 18));
        const isHovered = hoveredId === node.id;
        const pulseScale = 1 + Math.sin(t * 2 + (node.confidence || 0.5) * 6) * 0.08;
        const radius = (baseRadius + (isHovered ? 3 : 0)) * pulseScale;

        // Parse node color
        const color = node.color || '#888888';

        // Outer glow (large, soft)
        const outerGlow = ctx.createRadialGradient(p.x, p.y, radius * 0.5, p.x, p.y, radius * 4);
        outerGlow.addColorStop(0, rgba(color, 0.15));
        outerGlow.addColorStop(0.5, rgba(color, 0.05));
        outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Mid glow (verified/promoted rings)
        if (node.verified) {
          const ringGlow = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, radius + 12);
          ringGlow.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
          ringGlow.addColorStop(0.5, 'rgba(34, 197, 94, 0.1)');
          ringGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 12, 0, Math.PI * 2);
          ctx.fillStyle = ringGlow;
          ctx.fill();

          // Rotating ring
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(t * 0.5);
          ctx.beginPath();
          ctx.arc(0, 0, radius + 6, 0, Math.PI * 1.2);
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }

        if (node.promoted) {
          const promoGlow = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, radius + 20);
          promoGlow.addColorStop(0, 'rgba(234, 179, 8, 0.2)');
          promoGlow.addColorStop(0.5, 'rgba(234, 179, 8, 0.05)');
          promoGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 20, 0, Math.PI * 2);
          ctx.fillStyle = promoGlow;
          ctx.fill();

          // Double ring
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-t * 0.3);
          ctx.beginPath();
          ctx.arc(0, 0, radius + 14, 0, Math.PI * 0.8);
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, radius + 14, Math.PI, Math.PI * 1.8);
          ctx.stroke();
          ctx.restore();
        }

        // Inner glow (bright, tight)
        const innerGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 1.5);
        innerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        innerGlow.addColorStop(0.3, rgba(color, 0.6));
        innerGlow.addColorStop(0.7, rgba(color, 0.3));
        innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = innerGlow;
        ctx.fill();

        // Core sphere
        const coreGrad = ctx.createRadialGradient(
          p.x - radius * 0.3, p.y - radius * 0.3, 0,
          p.x, p.y, radius
        );
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.2, color);
        coreGrad.addColorStop(0.8, rgba(color, 0.8));
        coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // Specular highlight
        const specGrad = ctx.createRadialGradient(
          p.x - radius * 0.3, p.y - radius * 0.3, 0,
          p.x - radius * 0.2, p.y - radius * 0.2, radius * 0.6
        );
        specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = specGrad;
        ctx.fill();

        // Hover outline
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label
        if (radius > 7 || isHovered) {
          ctx.font = `${isHovered ? '12px' : '10px'} ui-monospace, monospace`;
          ctx.textAlign = 'center';

          // Text shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          const label = (node.name || node.fullName || '').slice(0, 30);
          ctx.fillText(label, p.x + 1, p.y + radius + 14 + 1);

          ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.95)' : 'rgba(200,210,230,0.6)';
          ctx.fillText(label, p.x, p.y + radius + 14);
        }
      }

      animFrameRef.current = requestAnimationFrame(simulate);
    }

    animFrameRef.current = requestAnimationFrame(simulate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const node of nodesRef.current) {
      const p = positions.current.get(node.id);
      if (!p) continue;
      const dx = mx - p.x;
      const dy = my - p.y;
      const radius = Math.max(4, (node.confidence || 0.5) * 18);
      if (dx * dx + dy * dy < (radius + 8) * (radius + 8)) {
        dragRef.current = { nodeId: node.id, offsetX: dx, offsetY: dy };
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current.nodeId) {
      const p = positions.current.get(dragRef.current.nodeId);
      if (p) {
        p.x = mx - dragRef.current.offsetX;
        p.y = my - dragRef.current.offsetY;
        p.vx = 0;
        p.vy = 0;
      }
    } else {
      let found: string | null = null;
      for (const node of nodesRef.current) {
        const p = positions.current.get(node.id);
        if (!p) continue;
        const dx = mx - p.x;
        const dy = my - p.y;
        const radius = Math.max(4, (node.confidence || 0.5) * 18);
        if (dx * dx + dy * dy < (radius + 8) * (radius + 8)) {
          found = node.id;
          break;
        }
      }
      hoverRef.current = found;
      canvas.style.cursor = found ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = () => {
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node) setSelectedNode(node);
    }
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
  };

  return <canvas ref={canvasRef} className="w-full h-full" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />;
}
