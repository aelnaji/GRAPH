'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';

export function ForceGraph3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const nodes = useKnowledgeStore((s) => s.nodes);
  const links = useKnowledgeStore((s) => s.links);
  const setSelectedNode = useKnowledgeStore((s) => s.setSelectedNode);
  const isLoading = useKnowledgeStore((s) => s.isLoading);

  const handleNodeClick = useCallback((node: any) => {
    const fullNode = nodes.find((n) => n.id === node.id);
    if (fullNode) {
      setSelectedNode(fullNode);
    }
  }, [nodes, setSelectedNode]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    async function initGraph() {
      if (destroyed) return;

      // Dynamic import to avoid SSR issues with canvas
      const [ForceGraph3DLib, THREE] = await Promise.all([
        import('3d-force-graph').then((m) => m.default),
        import('three'),
      ]);

      if (destroyed || !containerRef.current) return;

      // Clear existing graph
      if (graphRef.current) {
        graphRef.current._destructor();
      }

      const graph = new ForceGraph3DLib()(containerRef.current)
        .backgroundColor('#0a0a0f')
        .graphData({ nodes: [], links: [] })
        .nodeLabel('fullName')
        .nodeVal('val')
        .nodeColor('color')
        .nodeOpacity(0.9)
        .linkColor(() => 'rgba(255, 255, 255, 0.15)')
        .linkWidth(0.5)
        .linkOpacity(0.6)
        .linkDirectionalArrowLength(3.5)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles(2)
        .linkDirectionalParticleWidth(1.5)
        .linkDirectionalParticleColor(() => 'rgba(255, 200, 50, 0.6)')
        .d3AlphaDecay(0.02)
        .d3VelocityDecay(0.3)
        .warmupTicks(100)
        .cooldownTime(15000)
        .onNodeClick(handleNodeClick)
        .onNodeHover((node: any) => {
          containerRef.current!.style.cursor = node ? 'pointer' : 'grab';
        })
        .onBackgroundClick(() => {
          setSelectedNode(null);
        });

      // Node rendering using imported THREE
      graph.nodeThreeObject((node: any) => {
        const group = new THREE.Object3D();
        const { SphereGeometry, MeshPhongMaterial, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide, AmbientLight, DirectionalLight, PointLight } = THREE;

        // Main sphere
        const radius = Math.max(0.5, Math.min(4, (node.val || 5) / 3));
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const material = new THREE.MeshPhongMaterial({
          color: node.color || '#888888',
          transparent: true,
          opacity: 0.85,
          shininess: 60,
          emissive: node.verified ? (node.color || '#000000') : '#000000',
          emissiveIntensity: node.verified ? 0.3 : 0,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        // Verified badge - ring
        if (node.verified) {
          const ringGeo = new THREE.RingGeometry(radius + 0.3, radius + 0.5, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: '#22c55e',
            transparent: true,
            opacity: 0.6,
            side: DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }

        // Promoted badge - larger glow
        if (node.promoted) {
          const glowGeo = new THREE.RingGeometry(radius + 0.6, radius + 1.0, 32);
          const glowMat = new THREE.MeshBasicMaterial({
            color: '#eab308',
            transparent: true,
            opacity: 0.3,
            side: DoubleSide,
          });
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.rotation.x = Math.PI / 2;
          group.add(glow);
        }

        return group;
      });

      // Camera and controls
      graph.cameraPosition({ x: 0, y: 0, z: 300 });
      graph.showNavInfo(false);

      // Add lights
      graph.scene().add(new AmbientLight(0xcccccc, 0.6));
      const dirLight = new DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(100, 200, 100);
      graph.scene().add(dirLight);
      const pointLight = new PointLight(0x8888ff, 0.4, 500);
      pointLight.position.set(-100, -100, 100);
      graph.scene().add(pointLight);

      graphRef.current = graph;
    }

    initGraph();

    return () => {
      destroyed = true;
      if (graphRef.current) {
        try {
          graphRef.current._destructor();
        } catch { /* ignore */ }
        graphRef.current = null;
      }
    };
  }, []);

  // Update graph data when nodes/links change
  useEffect(() => {
    if (!graphRef.current || !nodes.length) return;

    const graphNodes = nodes.map((n) => ({
      ...n,
      x: undefined,
      y: undefined,
      z: undefined,
    }));

    const graphLinks = links
      .filter((l) => nodes.some((n) => n.id === l.source) && nodes.some((n) => n.id === l.target))
      .map((l) => ({
        source: l.source,
        target: l.target,
        ...l,
      }));

    graphRef.current.graphData({ nodes: graphNodes, links: graphLinks });
  }, [nodes, links]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-emerald-400 text-sm font-mono">Processing...</span>
          </div>
        </div>
      )}

      {/* Graph stats overlay */}
      <div className="absolute top-3 left-3 z-10">
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs font-mono space-y-1">
          <div className="text-emerald-400">
            Nodes: <span className="text-white">{nodes.length}</span>
          </div>
          <div className="text-amber-400">
            Edges: <span className="text-white">{links.length}</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs space-y-1.5">
          <div className="text-white/60 font-mono text-[10px] uppercase tracking-wider mb-1">Legend</div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-white/80">High confidence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-white/80">Medium confidence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
            <span className="text-white/80">Low confidence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-white/80">Negative valence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-emerald-400" />
            <span className="text-white/80">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-yellow-400" />
            <span className="text-white/80">Promoted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
