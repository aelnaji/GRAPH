import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RELATION_TYPES = ['related', 'causality', 'hierarchy', 'sequence', 'opposition'];

async function seedEdges() {
  const nodes = await prisma.knowledgeNode.findMany();
  console.log(`Found ${nodes.length} nodes`);

  await prisma.knowledgeEdge.deleteMany({});
  console.log('Cleared existing edges');

  if (nodes.length < 2) {
    console.log('Not enough nodes');
    return;
  }

  const nodeIds = nodes.map(n => n.id);
  const edgePairs = new Set<string>();
  const edges: { sourceId: string; targetId: string; relationType: string; weight: number; verified: boolean; metadata: string }[] = [];

  function addEdge(i: number, j: number, relationType: string, weight: number, verified: boolean) {
    // Use string comparison, not Math.min (which NaNs on CUIDs)
    const a = nodeIds[i] < nodeIds[j] ? nodeIds[i] : nodeIds[j];
    const b = nodeIds[i] < nodeIds[j] ? nodeIds[j] : nodeIds[i];
    const key = `${a}||${b}`;
    if (!edgePairs.has(key)) {
      edgePairs.add(key);
      edges.push({ sourceId: nodeIds[i], targetId: nodeIds[j], relationType, weight, verified, metadata: '{}' });
    }
  }

  // Strategy 1: Sequential chain (each node links to next 1-2)
  for (let i = 0; i < nodes.length; i++) {
    const next = (i + 1) % nodes.length;
    const next2 = (i + 2) % nodes.length;
    addEdge(i, next, 'sequence', 0.6 + Math.random() * 0.3, true);
    if (i < nodes.length - 1) {
      addEdge(i, next2, 'related', 0.3 + Math.random() * 0.3, false);
    }
  }

  // Strategy 2: Cross-connections (every 3rd and 5th)
  for (let i = 0; i < nodes.length; i++) {
    const cross = (i + 3) % nodes.length;
    const cross2 = (i + 5) % nodes.length;
    addEdge(i, cross, 'causality', 0.3 + Math.random() * 0.2, false);
    if (i !== cross2) {
      addEdge(i, cross2, 'related', 0.2 + Math.random() * 0.3, false);
    }
  }

  // Strategy 3: Random additional edges for density
  for (let e = 0; e < nodes.length; e++) {
    const i = Math.floor(Math.random() * nodes.length);
    const j = Math.floor(Math.random() * nodes.length);
    if (i !== j) {
      addEdge(i, j, RELATION_TYPES[e % RELATION_TYPES.length], 0.15 + Math.random() * 0.4, false);
    }
  }

  console.log(`Total unique edges to create: ${edges.length}`);

  for (let i = 0; i < edges.length; i += 20) {
    const batch = edges.slice(i, i + 20);
    await prisma.knowledgeEdge.createMany({ data: batch });
    console.log(`  Progress: ${Math.min(i + 20, edges.length)}/${edges.length}`);
  }

  const totalEdges = await prisma.knowledgeEdge.count();
  console.log(`Done! Total edges in DB: ${totalEdges}`);
}

seedEdges()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
