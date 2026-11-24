# GitHub & Open-Source Bounty Radar (USD / USDC / Algora / Opire)

Automatically discover, filter, and rank **live, low-competition paid open-source bounties** across GitHub (Algora, Opire, IssueHunt, OnlyDust, Drips Wave, Expensify, and Web3 repositories).

Built for **freelance developers, Web3 bounty hunters, dev agencies, and autonomous AI coding agents** (Claude, Cursor, Antigravity, Devin, OpenCode, n8n).

## What this Actor extracts
- **Normalized USD / Crypto Reward (`rewardUsd`, `rewardRaw`)** parsed from issue titles, labels, and descriptions
- **Competition Level (`LOW`, `MEDIUM`, `HIGH`)** calculated from comment velocity, assignee status, and freshness
- **Platform Detection** (`Algora`, `Opire`, `IssueHunt`, `OnlyDust`, `Drips Wave`, `Web3 / Crypto`, `GitHub Direct`)
- **Clean Metadata** (`repo`, `issueNumber`, `title`, `url`, `labels`, `commentsCount`, `updatedAt`, `summary`)

## Example Input
```json
{
  "keywords": ["bounty", "algora", "opire"],
  "languages": ["typescript", "python"],
  "minRewardUsd": 50,
  "maxComments": 12,
  "onlyUnassigned": true,
  "maxResults": 50
}
```

## Example Output
```json
{
  "repo": "example-org/example-repo",
  "issueNumber": 412,
  "title": "[$250] Fix WebSocket reconnect race condition",
  "url": "https://github.com/example-org/example-repo/issues/412",
  "rewardUsd": 250,
  "rewardRaw": "$250",
  "platformSignal": "Algora",
  "competitionLevel": "LOW",
  "commentsCount": 1,
  "hasAssignee": false,
  "labels": ["bounty", "bug", "typescript"],
  "updatedAt": "2026-11-24T12:15:00Z"
}
```

## Why use this Actor?
- **No proxies or browser overhead required** — ultra-fast execution (under 10 seconds per run).
- **Anti-saturation filtering** — skip crowded issues with 30+ competing comments or already assigned contributors.
- **AI-Agent & MCP ready** — clean JSON schema ready to connect directly to Apify MCP, n8n, Make, or Zapier.
