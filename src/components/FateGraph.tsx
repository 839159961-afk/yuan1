import React, { useRef, useMemo, useEffect, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import * as d3 from 'd3-force';

interface Node {
  id: string;
  name: string;
  val: number;
  color?: string;
}

interface Link {
  source: string;
  target: string;
  momentum: number; // Flow speed
  intimacy: number; // Particle density
  color?: string;
}

interface FateGraphProps {
  nodes: Node[];
  links: Link[];
  onNodeClick?: (node: any) => void;
}

const FateGraph: React.FC<FateGraphProps> = ({ nodes, links, onNodeClick }) => {
  const fgRef = useRef<ForceGraphMethods | null>(null);
  const [bgParticles] = useState(() => 
    Array.from({ length: 150 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.5,
      opacity: Math.random() * 0.5
    }))
  );

  useEffect(() => {
    if (fgRef.current) {
      const linkForce = fgRef.current.d3Force('link') as any;
      if (linkForce) {
        linkForce.distance((link: any) => 180 - (link.intimacy || 0.5) * 120);
      }
      const chargeForce = fgRef.current.d3Force('charge') as any;
      if (chargeForce) {
        chargeForce.strength(-300);
      }
      // Add a subtle centering force to keep things from drifting away too far
      fgRef.current.d3Force('center', d3.forceCenter());
    }
  }, [links]);

  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

    const label = node.name;
    const fontSize = 10 / globalScale;
    ctx.font = `${fontSize}px "Noto Serif SC"`;
    
    const baseRadius = (node.val || 3) * 1.5;
    const color = node.color || (node.id === 'user' ? '#00F2FF' : '#FF00FF');

    // Core glow
    const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, baseRadius * 10);
    gradient.addColorStop(0, color + '44');
    gradient.addColorStop(0.4, color + '11');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, baseRadius * 10, 0, 2 * Math.PI);
    ctx.fill();

    // Scattered particles around the node (nebula effect)
    const time = Date.now() * 0.001;
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2 + time * (i % 2 === 0 ? 0.4 : -0.3);
      const orbitDist = baseRadius * (3 + Math.sin(time * 0.5 + i) * 2);
      const px = node.x + Math.cos(angle) * orbitDist;
      const py = node.y + Math.sin(angle) * orbitDist;
      
      const pOpacity = 0.3 + Math.sin(time * 1.2 + i) * 0.2;
      ctx.fillStyle = color;
      ctx.globalAlpha = pOpacity;
      ctx.beginPath();
      ctx.arc(px, py, 0.8, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Node center (tiny bright core)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(node.x, node.y, 1.2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Node text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${fontSize}px "Space Grotesk"`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(label, node.x, node.y + baseRadius + 18);
  };

  const paintLink = (link: any, ctx: CanvasRenderingContext2D) => {
    const { source, target, momentum, intimacy, color } = link;
    if (typeof source !== 'object' || typeof target !== 'object') return;
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;

    // Particle flow effect
    const safeMomentum = Number.isFinite(momentum) ? momentum : 1;
    const safeIntimacy = Number.isFinite(intimacy) ? intimacy : 0.5;
    
    const time = Date.now() * 0.001 * safeMomentum;
    const numParticles = Math.floor(safeIntimacy * 40) + 15;
    const linkColor = color || '#00F2FF';
    
    for (let i = 0; i < numParticles; i++) {
      const t = (time + i / numParticles) % 1;
      
      // Add more "scatter" jitter to the path
      const jitterX = Math.sin(time * 4 + i * 0.6) * 5;
      const jitterY = Math.cos(time * 4 + i * 0.6) * 5;
      
      const x = source.x + (target.x - source.x) * t + jitterX;
      const y = source.y + (target.y - source.y) * t + jitterY;
      
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const pSize = Math.random() * 1.5 + 0.5;
      ctx.fillStyle = linkColor;
      ctx.globalAlpha = 0.5 + Math.sin(time * 3 + i) * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, pSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // Subtle nebula clouds
    const time = Date.now() * 0.0001;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
    gradient.addColorStop(0, 'rgba(0, 242, 255, 0.03)');
    gradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.02)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw background drifting particles
    bgParticles.forEach(p => {
      p.x = (p.x + p.vx + width) % width;
      p.y = (p.y + p.vy + height) % height;
      
      const pOpacity = p.opacity * (0.5 + Math.sin(time * 10 + p.x) * 0.5);
      ctx.fillStyle = `rgba(255, 255, 255, ${pOpacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  return (
    <div className="w-full h-full bg-[#050505]">
      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeCanvasObject={paintNode}
        linkCanvasObject={paintLink}
        onNodeClick={onNodeClick}
        backgroundColor="#050505"
        cooldownTicks={100}
      />
    </div>
  );
};

export default FateGraph;
