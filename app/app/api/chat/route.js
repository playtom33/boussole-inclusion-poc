import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read API key — prefer .env.local value, fallback to process.env
function getApiKey() {
  // Next.js should load .env.local, but system env may override with empty string
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.length > 0) return envKey;

  // Fallback: read .env.local directly
  try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match && match[1].trim()) return match[1].trim();
  } catch (e) { /* ignore */ }

  throw new Error('ANTHROPIC_API_KEY not found in env or .env.local');
}

let cachedClient = null;
function getClient() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: getApiKey() });
  }
  return cachedClient;
}

// Load knowledge base once at startup
let knowledgeBase = null;
function getKnowledgeBase() {
  if (!knowledgeBase) {
    const filePath = join(process.cwd(), 'data', 'knowledge_base.json');
    knowledgeBase = JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return knowledgeBase;
}

// Simple keyword search for RAG
function searchKnowledgeBase(query, maxResults = 5) {
  const kb = getKnowledgeBase();
  const queryWords = query.toLowerCase()
    .replace(/[^\wàâäéèêëïîôùûüÿçœæ\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const scored = [];

  for (const category of kb.categories) {
    for (const situation of category.situations) {
      let score = 0;
      const textToSearch = `${situation.title} ${situation.description} ${
        (situation.ressources || []).map(r => `${r.titre} ${r.description} ${r.aide_attendue}`).join(' ')
      }`.toLowerCase();

      for (const word of queryWords) {
        const regex = new RegExp(word, 'gi');
        const matches = textToSearch.match(regex);
        if (matches) score += matches.length;
      }

      // Boost for title matches
      const titleLower = situation.title.toLowerCase();
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 3;
      }

      if (score > 0) {
        scored.push({
          score,
          category: category.title,
          situation
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

function buildContext(results) {
  if (results.length === 0) return 'Aucune ressource trouvée pour cette recherche.';

  let context = '';
  for (const r of results) {
    context += `\n---\nCATÉGORIE : ${r.category}\n`;
    context += `SITUATION : ${r.situation.title}\n`;
    if (r.situation.description) {
      context += `DESCRIPTION : ${r.situation.description.substring(0, 150)}\n`;
    }
    if (r.situation.url) {
      context += `URL : ${r.situation.url}\n`;
    }
    if (r.situation.ressources && r.situation.ressources.length > 0) {
      context += `RESSOURCES :\n`;
      for (const res of r.situation.ressources.slice(0, 3)) {
        context += `  - [${res.type}] ${res.titre}`;
        if (res.description) context += ` — ${res.description.substring(0, 100)}`;
        context += `\n`;
        if (res.url) context += `    URL : ${res.url}\n`;
      }
    }
  }
  return context;
}

const SYSTEM_PROMPT = `Tu es l'assistant de la Boussole de l'Inclusion, sur la plateforme Inclusive de Tralalere. Tu aides les enseignants, parents et AESH à repérer les difficultés d'apprentissage des élèves et à trouver des ressources adaptées.

RÈGLES ABSOLUES — NE JAMAIS ENFREINDRE :
1. Tu ne poses JAMAIS de diagnostic. Tu formules uniquement des "pistes à explorer avec un professionnel".
2. À chaque synthèse, rappelle que tes suggestions ne remplacent pas un avis médical ou paramédical.
3. N'utilise JAMAIS de termes affirmatifs ("votre enfant est dyslexique"). Utilise TOUJOURS le conditionnel ("les observations que vous décrivez pourraient évoquer...").
4. Réponds en français, dans un langage accessible.
5. Ne recommande QUE les ressources fournies dans le contexte ci-dessous. Ne jamais inventer de ressource.
6. Demande le contexte au premier message : âge/classe de l'élève, rôle de l'utilisateur (parent, enseignant, AESH).

ANCRAGE AU DATASET — TRÈS IMPORTANT :
- Tu dois t'appuyer PRINCIPALEMENT sur les situations et descriptions fournies dans le contexte ci-dessous pour formuler tes réponses.
- Quand tu décris des difficultés ou des pistes, reprends les termes et formulations utilisés dans les titres et descriptions des situations du contexte.
- Tes questions de précision doivent viser à ORIENTER vers les situations existantes dans la base de données. Par exemple, si le contexte contient des situations sur la lecture, l'écriture et la concentration, pose des questions qui permettent de distinguer entre ces situations.
- N'ajoute PAS d'informations médicales, scientifiques ou techniques issues de tes connaissances propres (pas de termes comme "dyslexie", "dysorthographie", "trouble neurodéveloppemental", etc. sauf si ces termes apparaissent dans le contexte).
- Quand tu fais une synthèse, reformule les descriptions des situations pertinentes du contexte plutôt que d'inventer ta propre analyse.
- Les quickReplies doivent correspondre à des thématiques ou situations PRÉSENTES dans le contexte fourni.

COMPORTEMENT :
- Commence par comprendre la situation avec des questions ouvertes
- Puis pose 2-3 questions de précision ciblées, inspirées des catégories et situations du contexte
- Fais correspondre les observations de l'utilisateur avec les situations du contexte
- Propose les ressources associées aux situations qui correspondent le mieux
- Termine toujours par une question ouverte pour continuer l'échange
- Quand tu cites une ressource, mentionne son type et son aide attendue si disponible

FORMAT DE RÉPONSE OBLIGATOIRE :
Tu DOIS répondre en JSON valide, avec exactement cette structure (sans texte avant ou après le JSON) :
{
  "text": "Ton message texte principal ici. Tu peux utiliser des retours à la ligne avec \\n.",
  "resources": [
    {
      "type": "Conseils d'experts | Parcours pédagogique | Parcours d'autoformation | Conseils pratiques | Kit pédagogique | Collection",
      "title": "Titre de la situation",
      "description": "Courte description (1-2 phrases max)",
      "url": "URL de la ressource si disponible"
    }
  ],
  "quickReplies": ["Suggestion de réponse 1", "Suggestion de réponse 2", "Suggestion de réponse 3"]
}

RÈGLES POUR LE JSON :
- "text" : ton message conversationnel principal. Obligatoire.
- "resources" : tableau des ressources pertinentes à afficher. Peut être vide [] si tu n'as pas encore assez d'infos pour recommander. Limite à 4-6 ressources maximum. Ne cite QUE des ressources présentes dans le contexte.
- "quickReplies" : 2-4 suggestions de réponses rapides contextuelles pour guider l'utilisateur. Obligatoire, adapte-les au contexte de la conversation.
- Le JSON doit être valide et parsable. Pas de commentaires dans le JSON.
- Échappe les guillemets dans les valeurs texte avec \\"

RESSOURCES DISPONIBLES (issues de la Boussole de l'Inclusion) :
{CONTEXT}`;

export async function POST(request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Messages requis' }, { status: 400 });
    }

    // Build search query from recent user messages
    const recentUserMessages = messages
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content)
      .join(' ');

    // Search knowledge base
    const results = searchKnowledgeBase(recentUserMessages);
    const context = buildContext(results);
    const systemPrompt = SYSTEM_PROMPT.replace('{CONTEXT}', context);

    // Build conversation messages for Claude (must start with 'user' role)
    let conversationMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    // Strip leading assistant messages (e.g. welcome message) — Anthropic API requires first message to be 'user'
    while (conversationMessages.length > 0 && conversationMessages[0].role === 'assistant') {
      conversationMessages.shift();
    }

    // Call Claude API
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    });

    const rawText = response.content[0].text;

    // Parse the JSON response from Claude
    let parsed;
    try {
      // Try to extract JSON from the response (in case Claude adds text around it)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      // Fallback: if JSON parsing fails, treat the whole response as text
      console.warn('JSON parse failed, using raw text:', parseError.message);
      parsed = {
        text: rawText,
        resources: [],
        quickReplies: ["Pouvez-vous m'en dire plus ?", "Je souhaite explorer une autre piste"]
      };
    }

    return Response.json({
      text: parsed.text || rawText,
      resources: parsed.resources || [],
      quickReplies: parsed.quickReplies || [],
      // Keep backward compatibility
      response: parsed.text || rawText,
    });
  } catch (error) {
    console.error('API error:', error?.message || error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return Response.json(
      { error: 'Erreur lors du traitement de la requête', details: error?.message },
      { status: 500 }
    );
  }
}
