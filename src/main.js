import { Actor, log } from 'apify';

const REWARD_PATTERNS = [
  { regex: /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*(?:USD|USDC|USDT)?/i, currency: 'USD' },
  { regex: /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*(USD|USDC|USDT)\b/i, currency: 'USD' },
  { regex: /💎\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)/i, currency: 'USD' },
  { regex: /bounty[:\s-]+\$?\s*(\d{1,3}(?:,\d{3})+|\d+)/i, currency: 'USD' },
];

function extractReward(title = '', body = '', labels = []) {
  const labelText = labels.map((l) => l.name || '').join(' ');
  const combined = `${title} ${labelText} ${(body || '').slice(0, 1200)}`;

  for (const { regex } of REWARD_PATTERNS) {
    const match = combined.match(regex);
    if (match && match[1]) {
      const numeric = parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isNaN(numeric) && numeric >= 5 && numeric <= 500000) {
        return {
          rewardUsd: Math.round(numeric),
          rewardRaw: match[0].trim(),
        };
      }
    }
  }
  return { rewardUsd: 0, rewardRaw: 'Unpriced' };
}

function detectPlatform(title = '', body = '', labels = []) {
  const text = `${title} ${labels.map((l) => l.name || '').join(' ')} ${(body || '').slice(0, 1000)}`.toLowerCase();
  if (text.includes('algora') || text.includes('💎')) return 'Algora';
  if (text.includes('opire') || text.includes('/opire')) return 'Opire';
  if (text.includes('issuehunt')) return 'IssueHunt';
  if (text.includes('onlydust')) return 'OnlyDust';
  if (text.includes('drips') || text.includes('wave')) return 'Drips Wave';
  if (text.includes('expensify')) return 'Expensify';
  if (text.includes('usdc') || text.includes('usdt') || text.includes('sol')) return 'Web3 / Crypto';
  return 'GitHub Direct';
}

function scoreCompetition(commentsCount, hasAssignee, updatedAt) {
  const daysOld = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (hasAssignee || commentsCount >= 10) return 'HIGH';
  if (commentsCount >= 4 || daysOld > 30) return 'MEDIUM';
  return 'LOW';
}

function extractRepo(repositoryUrl = '') {
  const parts = repositoryUrl.split('/repos/');
  return parts[1] || repositoryUrl;
}

await Actor.init();

try {
  const input = (await Actor.getInput()) || {};
  const {
    keywords = ['bounty', 'algora', 'opire'],
    languages = [],
    minRewardUsd = 50,
    maxComments = 15,
    onlyUnassigned = true,
    maxResults = 50,
    githubToken = process.env.GITHUB_TOKEN || '',
  } = input;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Apify-GitHub-Bounty-Radar/1.0',
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const seenUrls = new Set();
  const collected = [];

  const langClause =
    Array.isArray(languages) && languages.length > 0
      ? ` (${languages.map((l) => l.trim()).filter(Boolean).join(' OR ')})`
      : '';

  const searchTerms = Array.isArray(keywords) && keywords.length > 0 ? keywords : ['bounty'];

  for (const kw of searchTerms) {
    if (collected.length >= maxResults * 2) break;

    const q = `is:issue is:open "${kw}"${langClause} sort:updated-desc`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=50`;

    log.info(`Querying GitHub API for keyword="${kw}"...`);
    const resp = await fetch(url, { headers });

    if (resp.status === 403 || resp.status === 429) {
      log.warning(`GitHub API rate limit reached (${resp.status}). Returning collected results so far.`);
      break;
    }
    if (!resp.ok) {
      log.warning(`GitHub API returned HTTP ${resp.status} for keyword="${kw}"`);
      continue;
    }

    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      if (!item.html_url || seenUrls.has(item.html_url)) continue;
      seenUrls.add(item.html_url);

      const hasAssignee = Boolean(item.assignee) || (Array.isArray(item.assignees) && item.assignees.length > 0);
      if (onlyUnassigned && hasAssignee) continue;
      if (typeof item.comments === 'number' && item.comments > maxComments) continue;

      const { rewardUsd, rewardRaw } = extractReward(item.title, item.body, item.labels || []);
      if (minRewardUsd > 0 && rewardUsd < minRewardUsd) continue;

      const platformSignal = detectPlatform(item.title, item.body, item.labels || []);
      const competitionLevel = scoreCompetition(item.comments || 0, hasAssignee, item.updated_at);

      collected.push({
        repo: extractRepo(item.repository_url),
        issueNumber: item.number,
        title: item.title,
        url: item.html_url,
        rewardUsd,
        rewardRaw,
        platformSignal,
        competitionLevel,
        commentsCount: item.comments || 0,
        hasAssignee,
        labels: (item.labels || []).map((l) => l.name),
        author: item.user?.login || '',
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        summary: (item.body || '').replace(/\s+/g, ' ').trim().slice(0, 280),
      });
    }

    // Gentle delay between queries to stay well inside GitHub Search API limits
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Rank: LOW competition first, then highest USD reward, then newest updatedAt
  const compWeight = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  collected.sort((a, b) => {
    if (compWeight[a.competitionLevel] !== compWeight[b.competitionLevel]) {
      return compWeight[a.competitionLevel] - compWeight[b.competitionLevel];
    }
    if (b.rewardUsd !== a.rewardUsd) return b.rewardUsd - a.rewardUsd;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const finalItems = collected.slice(0, maxResults);
  if (finalItems.length > 0) {
    await Actor.pushData(finalItems);
  }

  log.info(`Done! Pushed ${finalItems.length} ranked open-source bounties to dataset.`);
} catch (err) {
  log.error(`Actor failed: ${err.message}`);
  throw err;
} finally {
  await Actor.exit();
}
