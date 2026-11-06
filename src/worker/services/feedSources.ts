import type { Db } from '../db/client'
import { feedSources } from '../db/schema'
import { sql, notInArray } from 'drizzle-orm'

export interface FeedSource {
  id: string
  name: string
  url: string
  category: string
  type: 'rss' | 'arxiv' | 'hn' | 'reddit' | 'github'
  priority: 1 | 2 | 3
}

export const FEED_SOURCES: FeedSource[] = [

  // ── RESEARCH PAPERS ───────────────────────────────────────────────────────
  { id: 'arxiv-cs-lg', name: 'arXiv Machine Learning', url: 'cs.LG', category: 'papers', type: 'arxiv', priority: 3 },
  { id: 'arxiv-cs-cl', name: 'arXiv Computation & Language', url: 'cs.CL', category: 'papers', type: 'arxiv', priority: 3 },
  { id: 'arxiv-cs-ai', name: 'arXiv Artificial Intelligence', url: 'cs.AI', category: 'papers', type: 'arxiv', priority: 3 },
  { id: 'arxiv-cs-cv', name: 'arXiv Computer Vision', url: 'cs.CV', category: 'papers', type: 'arxiv', priority: 2 },
  // HF Daily Papers requires auth — use HF Blog which covers the same content
  { id: 'hf-blog', name: 'HuggingFace Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'papers', type: 'rss', priority: 3 },
  // Papers With Code merged into HF — removed; covered by arXiv + HF Blog

  // ── MODEL LABS ────────────────────────────────────────────────────────────
  // Anthropic removed their blog RSS; coverage via HN + Simon Willison + The Decoder
  // Claude Code GitHub releases are the highest-signal engineering updates
  { id: 'anthropic-claude-code', name: 'Anthropic (Claude Code)', url: 'https://github.com/anthropics/claude-code/releases.atom', category: 'labs', type: 'rss', priority: 3 },
  { id: 'openai-blog', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', category: 'labs', type: 'rss', priority: 3 },
  // Meta AI blog RSS broken; Facebook Engineering covers Meta AI content
  { id: 'meta-engineering', name: 'Meta Engineering (AI)', url: 'https://engineering.fb.com/feed/', category: 'labs', type: 'rss', priority: 2 },
  // Mistral — correct URL is /news/rss not /news/feed/
  { id: 'mistral-blog', name: 'Mistral AI', url: 'https://mistral.ai/news/rss', category: 'labs', type: 'rss', priority: 3 },
  // Qwen blog broken; use GitHub releases for Qwen3 model drops
  { id: 'qwen-releases', name: 'Qwen (Alibaba)', url: 'https://github.com/QwenLM/Qwen3/releases.atom', category: 'labs', type: 'rss', priority: 3 },
  { id: 'deepmind-blog', name: 'Google DeepMind', url: 'https://blog.google/technology/ai/rss/', category: 'labs', type: 'rss', priority: 2 },
  { id: 'google-research', name: 'Google Research', url: 'https://research.google/blog/rss/', category: 'labs', type: 'rss', priority: 2 },
  { id: 'msft-research', name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', category: 'labs', type: 'rss', priority: 2 },
  // DeepSeek: no blog RSS; papers come through arXiv, releases via HN + GitHub
  { id: 'deepseek-releases', name: 'DeepSeek', url: 'https://github.com/deepseek-ai/DeepSeek-V3/releases.atom', category: 'labs', type: 'rss', priority: 3 },

  // ── PROTOCOLS & SPECS ────────────────────────────────────────────────────
  { id: 'mcp-blog', name: 'MCP Blog (Model Context Protocol)', url: 'https://blog.modelcontextprotocol.io/index.xml', category: 'tools', type: 'rss', priority: 3 },

  // ── TOOLS & FRAMEWORKS ───────────────────────────────────────────────────
  // LangChain moved from Ghost blog to langchain.com (no RSS); use LangGraph releases
  { id: 'langgraph-releases', name: 'LangGraph', url: 'https://github.com/langchain-ai/langgraph/releases.atom', category: 'tools', type: 'rss', priority: 3 },
  { id: 'llamaindex-blog', name: 'LlamaIndex', url: 'https://www.llamaindex.ai/blog/rss.xml', category: 'tools', type: 'rss', priority: 3 },
  // vLLM blog broken; use GitHub releases which announce every version
  { id: 'vllm-releases', name: 'vLLM (Inference)', url: 'https://github.com/vllm-project/vllm/releases.atom', category: 'tools', type: 'rss', priority: 3 },
  // Local inference — essential for AI engineers
  { id: 'ollama-releases', name: 'Ollama', url: 'https://github.com/ollama/ollama/releases.atom', category: 'tools', type: 'rss', priority: 3 },
  { id: 'llamacpp-releases', name: 'llama.cpp', url: 'https://github.com/ggml-org/llama.cpp/releases.atom', category: 'tools', type: 'rss', priority: 2 },
  { id: 'unsloth-blog', name: 'Unsloth (Fine-tuning)', url: 'https://unsloth.ai/blog/rss', category: 'tools', type: 'rss', priority: 2 },
  // Cohere blog has no RSS; GitHub releases cover SDK/API changes
  { id: 'cohere-releases', name: 'Cohere', url: 'https://github.com/cohere-ai/cohere-python/releases.atom', category: 'tools', type: 'rss', priority: 2 },
  // W&B — correct URL is /blog/feed not /fully-connected/feed.xml
  { id: 'wandb-blog', name: 'Weights & Biases', url: 'https://wandb.ai/blog/feed', category: 'tools', type: 'rss', priority: 2 },

  // ── PRACTITIONER BLOGS (the "so what" layer — turns papers into insight) ──
  { id: 'simon-willison', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', category: 'news', type: 'rss', priority: 3 },
  // Sebastian Raschka: 200k readers, weekly ML paper deep-dives for practitioners
  { id: 'sebastian-raschka', name: 'Sebastian Raschka (Ahead of AI)', url: 'https://magazine.sebastianraschka.com/feed', category: 'news', type: 'rss', priority: 3 },
  // Chip Huyen: production AI systems design — the most practical engineering content
  { id: 'chip-huyen', name: 'Chip Huyen', url: 'https://huyenchip.com/feed.xml', category: 'news', type: 'rss', priority: 3 },
  { id: 'the-decoder', name: 'THE DECODER', url: 'https://the-decoder.com/feed/', category: 'news', type: 'rss', priority: 2 },
  { id: 'bair-blog', name: 'BAIR (Berkeley AI)', url: 'https://bair.berkeley.edu/blog/feed.xml', category: 'news', type: 'rss', priority: 2 },

  // ── COMMUNITY & DISCUSSION ────────────────────────────────────────────────
  // HN: use simple single-term queries — Algolia doesn't support complex OR in this endpoint
  { id: 'hn-llm', name: 'Hacker News — LLM', url: 'LLM', category: 'community', type: 'hn', priority: 3 },
  { id: 'hn-agents', name: 'Hacker News — Agents', url: 'AI agent', category: 'community', type: 'hn', priority: 2 },
  // Reddit — requires OAuth2 (REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in env)
  { id: 'reddit-localllama', name: 'r/LocalLLaMA', url: 'LocalLLaMA', category: 'community', type: 'reddit', priority: 3 },
  { id: 'reddit-ml', name: 'r/MachineLearning', url: 'MachineLearning', category: 'community', type: 'reddit', priority: 2 },
  { id: 'devto-llm', name: 'Dev.to LLM', url: 'https://dev.to/feed/tag/llm', category: 'community', type: 'rss', priority: 2 },
  { id: 'devto-ai-agents', name: 'Dev.to AI Agents', url: 'https://dev.to/feed/tag/ai-agents', category: 'community', type: 'rss', priority: 2 },

  // ── VIRAL REPOS & COMMUNITY BUILDS ───────────────────────────────────────
  { id: 'github-viral-ai', name: 'GitHub Trending AI Repos', url: 'topic:llm language:python', category: 'community', type: 'github', priority: 3 },
  { id: 'github-awesome-ai', name: 'GitHub Awesome AI Lists', url: 'awesome-llm OR awesome-claude OR awesome-ai-agents OR awesome-mcp', category: 'community', type: 'github', priority: 2 },

]

export const CATEGORIES: Record<string, string> = {
  papers: 'Research Papers',
  labs: 'Model Labs',
  tools: 'Tools & Frameworks',
  news: 'News & Blogs',
  community: 'Community & Builds',
}

// Upsert all current sources; disable any that are no longer in the list
export async function syncSources(db: Db): Promise<void> {
  if (FEED_SOURCES.length === 0) return

  await db.insert(feedSources).values(
    FEED_SOURCES.map((s) => ({
      id: s.id, name: s.name, url: s.url,
      category: s.category, type: s.type, priority: s.priority, enabled: true,
    })),
  ).onConflictDoUpdate({
    target: feedSources.id,
    set: {
      name: sql`excluded.name`,
      url: sql`excluded.url`,
      category: sql`excluded.category`,
      type: sql`excluded.type`,
      priority: sql`excluded.priority`,
    },
  })

  const currentIds = FEED_SOURCES.map((s) => s.id)
  await db.update(feedSources)
    .set({ enabled: false })
    .where(notInArray(feedSources.id, currentIds))
}

export async function ensureSourcesSeeded(db: Db): Promise<void> {
  return syncSources(db)
}
