import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('knowledge_base_raw.json', 'utf-8'));

// Process: improve resource structure from rawText
const processed = {
  categories: raw.categories.map(cat => ({
    id: cat.id,
    title: cat.title,
    description: cat.description,
    situations: cat.situations.map(sit => {
      // Clean up resources - the "title" field from first scrape actually contains the type
      const ressources = (sit.ressources || []).map(res => {
        const type = res.title || res.type || '';
        // Try to extract the real title from description
        const desc = res.description || '';
        return {
          titre: type, // For now, use type as title (will be enriched)
          type: type,
          description: desc,
          aide_attendue: res.aide_attendue || '',
          url: res.url || ''
        };
      });

      // Also try to extract resources from rawText if available
      if (sit.rawText && ressources.length === 0) {
        // Parse rawText to find resources
        const lines = sit.rawText.split('\n').filter(l => l.trim());
        // Simple heuristic extraction
      }

      return {
        title: sit.title,
        description: sit.description,
        url: sit.url,
        ressources
      };
    })
  })),
  collections: deduplicateCollections(raw.collections || [])
};

function deduplicateCollections(collections) {
  const seen = new Set();
  return collections.filter(c => {
    const key = `${c.title}|${c.description?.substring(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Stats
let totalSituations = 0;
let totalResources = 0;
let situationsWithResources = 0;
processed.categories.forEach(c => {
  c.situations.forEach(s => {
    totalSituations++;
    totalResources += s.ressources.length;
    if (s.ressources.length > 0) situationsWithResources++;
  });
});

console.log('Stats after processing:');
console.log(`  Categories: ${processed.categories.length}`);
console.log(`  Situations: ${totalSituations}`);
console.log(`  Situations with resources: ${situationsWithResources}`);
console.log(`  Total resources: ${totalResources}`);
console.log(`  Collections: ${processed.collections.length}`);

writeFileSync('app/data/knowledge_base.json', JSON.stringify(processed, null, 2), 'utf-8');
console.log('\n✓ Saved app/data/knowledge_base.json');

const fileSize = readFileSync('app/data/knowledge_base.json').length;
console.log(`  File size: ${(fileSize / 1024).toFixed(1)} KB`);
