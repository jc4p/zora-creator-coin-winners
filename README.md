# Zora Creator Coin Analysis 🎨💰

> **📺 Livestream Project**
> This project was built during a livestream by [@jc4p](https://farcaster.xyz/jc4p)
> 🎥 [Watch the recording on YouTube](https://youtu.be/yQkRGgyAtco)

Analyze Zora creator coins to understand which types of creators earn the most. This project fetches creator data from Zora, collects their Farcaster social content, uses AI to classify them into categories (Builder, Creative, Influencer, Lifestyle), and generates statistical analysis with visualizations.

## Features

- 📊 Fetch top Zora creator coins with market data
- 💰 Calculate creator earnings from Zora API (or onchain analysis)
- 🎭 Classify creators using AI (Google Gemini) based on their social content
- 📈 Generate comprehensive statistical analysis and visualizations
- ⚡ Async/parallel processing for faster execution
- 🔄 Resume capability for interrupted runs

> **Note:** Use the Zora API method for earnings detection. The onchain analysis currently only supports one contract version and may miss earnings from other contract versions.

## Prerequisites

- [Bun](https://bun.sh/) (JavaScript runtime)
- [Python 3.8+](https://www.python.org/downloads/) with pip
- API Keys:
  - [Neynar API](https://neynar.com/) - For Farcaster data
  - [Google Gemini API](https://ai.google.dev/) - For AI classification
  - [Base RPC URL](https://www.base.org/) - For onchain analysis (optional)

## Installation

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install JavaScript Dependencies

```bash
bun install
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Set Environment Variables

Create a `.env` file or export these variables:

```bash
export NEYNAR_API_KEY="your_neynar_api_key"
export GEMINI_API_KEY="your_gemini_api_key"
export BASE_RPC_URL="your_base_rpc_url"  # Optional, for onchain analysis
```

**Getting API Keys:**
- **Neynar**: Sign up at [neynar.com](https://neynar.com/) and get your API key from the dashboard
- **Gemini**: Get your API key from [Google AI Studio](https://ai.google.dev/)
- **Base RPC**: Use [Alchemy](https://www.alchemy.com/), [Infura](https://www.infura.io/), or [QuickNode](https://www.quicknode.com/)

## Quick Start

### Option 1: Complete Pipeline (Recommended)

Run the entire analysis pipeline with one command:

**JavaScript version:**
```bash
bun batch-classify-creators.js
```

**Python version (faster, with async):**
```bash
python3 batch-classify-creators.py
```

This will:
1. Load creator earnings data
2. Fetch Farcaster social content for each creator
3. Classify creators using AI
4. Generate output JSON with classifications

Then run the analysis:
```bash
python3 analyze-classifications.py
```

### Option 2: Step-by-Step

For more control, run each step individually:

#### Step 1: Fetch Zora Creator Coins
```bash
bun fetch-zora-coins.js
```
**Output:** `zora-featured-creators.json`, `zora-most-valuable-creators.json`

#### Step 2: Get Creator Earnings

**Option A - Using Zora API (Recommended):**
```bash
bun detect-creator-fees-api.js
```
**Output:** `creator-fees-api-results.json`

> **Note:** This is the preferred method. The onchain analysis script currently only supports one contract version and may miss earnings from other contract versions.

**Option B - Onchain Analysis (Incomplete):**
```bash
bun detect-creator-fees.js
```
**Output:** `creator-fees-results.json`

> ⚠️ **Warning:** This method currently only analyzes one contract version and will miss earnings from other versions. Use the API method above for complete data.

#### Step 3: Classify Creators

**JavaScript version:**
```bash
bun batch-classify-creators.js
```

**Python version (faster):**
```bash
python3 batch-classify-creators.py
```

**Output:** `creator-classifications-with-earnings.json`

#### Step 4: Analyze Results
```bash
python3 analyze-classifications.py
```
**Output:** Charts and statistics in `./analysis/` directory

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. Data Collection                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  fetch-zora-coins.js                                             │
│       │                                                           │
│       ├─→ zora-featured-creators.json                            │
│       └─→ zora-most-valuable-creators.json                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    2. Earnings Analysis                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  detect-creator-fees-api.js  OR  detect-creator-fees.js         │
│            (API-based)              (On-chain)                   │
│                 │                       │                        │
│                 └───────────┬───────────┘                        │
│                             ↓                                     │
│                creator-fees-api-results.json                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              3. Social Data + AI Classification                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  batch-classify-creators.{js|py}                                 │
│       │                                                           │
│       ├─→ Fetch Farcaster casts → ./casts/*.json                │
│       └─→ AI Classification → creator-classifications-with-      │
│                                 earnings.json                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              4. Statistical Analysis & Visualization             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  analyze-classifications.py                                      │
│       │                                                           │
│       └─→ ./analysis/                                            │
│            ├─ category_distribution.png                          │
│            ├─ earnings_boxplot_all.png                           │
│            ├─ followers_vs_earnings.png                          │
│            ├─ top_20_earners.png                                 │
│            └─ summary_report.txt                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## File Descriptions

### Data Collection Scripts

| File | Purpose | Runtime | Output |
|------|---------|---------|--------|
| `fetch-zora-coins.js` | Fetch top creator coins from Zora API | Bun | `zora-featured-creators.json`<br>`zora-most-valuable-creators.json` |
| `fetch-casts.js` | Fetch Farcaster casts for individual users (manual) | Bun | `./casts/{username}-casts.json` |

### Earnings Analysis Scripts

| File | Purpose | Runtime | Output |
|------|---------|---------|--------|
| `detect-creator-fees-api.js` | Get creator earnings via Zora API **(Recommended)** | Bun | `creator-fees-api-results.json` |
| `detect-creator-fees.js` | Analyze onchain creator fees from Base ⚠️ **(Incomplete - missing other contract versions)** | Bun | `creator-fees-results.json` |

### Classification Scripts

| File | Purpose | Runtime | Output |
|------|---------|---------|--------|
| `batch-classify-creators.js` | Full pipeline: fetch + classify (sync) | Bun | `creator-classifications-with-earnings.json` |
| `batch-classify-creators.py` | Full pipeline: fetch + classify (async, faster) | Python | `creator-classifications-with-earnings.json` |
| `classify-creators.js` | Classify from existing cast data | Bun | `creator-classifications.json` |
| `reclassify-creators.py` | Re-run classification with updated categories | Python | `creator-classifications-with-earnings.json` |

### Analysis & Visualization Scripts

| File | Purpose | Runtime | Output |
|------|---------|---------|--------|
| `analyze-classifications.py` | Generate statistics and charts | Python | `./analysis/` (8 charts + report) |
| `show-category-samples.py` | Display random examples by category | Python | Terminal output |

## Classification Categories

The AI classifies creators into these categories:

- **Builder** - Creates tools, apps, technical projects, infrastructure, open source software, launches products
- **Creative** - Creates art, design, music, visual content, memes, creative expression, digital collectibles
- **Influencer** - Well-known industry figures (typically >50k followers) who primarily share insights, commentary, and opinions
- **Lifestyle** - Personal updates, daily life, travel, food, fitness, wellness, personal brand, general social engagement

### Customizing Classification Categories

You can modify the categories to fit your analysis needs. The categories are defined in the `CLASSIFICATION_CATEGORIES` constant in each classification script.

#### Files to Update

Update the category definitions in these files:

1. **JavaScript files:**
   - `batch-classify-creators.js` (lines 31-37)
   - `classify-creators.js` (lines 16-21)

2. **Python files:**
   - `batch-classify-creators.py` (lines 22-27)
   - `reclassify-creators.py` (lines 20-25)

#### Example: Adding a New Category

```javascript
// In batch-classify-creators.js or classify-creators.js
const CLASSIFICATION_CATEGORIES = [
  'Builder - Creates tools, apps, technical projects, infrastructure, open source software',
  'Creative - Creates art, design, music, visual content, memes, creative expression',
  'Influencer - Well-known industry figures who share insights, commentary, and opinions',
  'Lifestyle - Personal updates, daily life, travel, food, fitness, wellness',
  'Educator - Creates educational content, tutorials, courses, teaches others',  // NEW CATEGORY
];
```

```python
# In batch-classify-creators.py or reclassify-creators.py
CLASSIFICATION_CATEGORIES = [
    'Builder - Creates tools, apps, technical projects, infrastructure, open source software',
    'Creative - Creates art, design, music, visual content, memes, creative expression',
    'Influencer - Well-known industry figures who share insights, commentary, and opinions',
    'Lifestyle - Personal updates, daily life, travel, food, fitness, wellness',
    'Educator - Creates educational content, tutorials, courses, teaches others',  # NEW CATEGORY
]
```

#### Re-running Classification with New Categories

After updating the categories, you have two options:

**Option 1: Re-classify existing data (faster)**

If you already have Farcaster casts cached in `./casts/`:

```bash
python3 reclassify-creators.py
```

This will re-classify all creators using the new categories without fetching data again.

**Option 2: Run full pipeline**

```bash
# JavaScript
bun batch-classify-creators.js

# Or Python (faster)
python3 batch-classify-creators.py
```

#### Tips for Good Categories

- **Be specific**: Include examples and keywords in the category description
- **Be mutually exclusive**: Categories should be distinct to avoid confusion
- **Keep it simple**: 3-6 categories work best for clear analysis
- **Update prompts**: The AI prompt includes examples - update those too for better results

**Example prompt section in the scripts:**
```javascript
**Examples:**
- **Influencer**: Balaji, Vitalik, influential VCs
- **Builder**: Actively shipping products, writing code
- **Creative**: Artists minting NFTs, musicians, designers
- **Lifestyle**: Fitness journeys, food content, travel
```

## Output Files

### Data Files

- `zora-featured-creators.json` - Featured creator coins from Zora
- `zora-most-valuable-creators.json` - Top creator coins by market cap
- `creator-fees-api-results.json` - Creator earnings data
- `creator-classifications-with-earnings.json` - Final classifications with earnings
- `./casts/{username}-casts.json` - Cached Farcaster content

### Analysis Output

Located in `./analysis/`:

- `category_distribution.png` - Pie charts of category breakdown
- `earnings_boxplot_all.png` - Earnings distribution by category (box plot)
- `earnings_violin_all.png` - Earnings distribution (violin plot)
- `earnings_boxplot_stars.png` - Zora Stars earnings analysis
- `earnings_comparison_bar.png` - Mean earnings comparison
- `followers_vs_earnings.png` - Scatter plot of followers vs earnings
- `earnings_histograms.png` - Earnings distribution histograms
- `top_20_earners.png` - Top 20 earners across all categories
- `summary_report.txt` - Detailed statistics report

## Advanced Usage

### Manual Classification

Fetch casts for specific users and classify them:

```bash
# Fetch casts
bun fetch-casts.js username1 username2 username3

# Classify from cached casts
bun classify-creators.js
```

### Re-classify with Updated Categories

If you update the classification categories or want to re-run:

```bash
python3 reclassify-creators.py
```

### View Random Samples by Category

```bash
python3 show-category-samples.py
```

## Troubleshooting

### Rate Limiting

If you hit rate limits:

1. **Neynar API**: The scripts include delays between requests (2s for JavaScript, configurable for Python)
2. **Gemini API**: Retry logic is built-in with exponential backoff
3. **Increase delays**: Edit `DELAY_BETWEEN_FETCHES` in the scripts

### Resume Interrupted Runs

The scripts automatically cache data:

- **Farcaster casts**: Stored in `./casts/` and skipped if already fetched
- **Zora API**: Progress saved to `progress-*.json` files
- **Re-run the command** and it will resume from where it left off

### Missing Dependencies

```bash
# JavaScript
bun install

# Python
pip install -r requirements.txt
```

### API Key Errors

Ensure your environment variables are set:

```bash
echo $NEYNAR_API_KEY
echo $GEMINI_API_KEY
```

If empty, set them:

```bash
export NEYNAR_API_KEY="your_key_here"
export GEMINI_API_KEY="your_key_here"
```

## Performance

- **JavaScript version**: Sequential processing, ~2-5 minutes for 100 creators
- **Python async version**: Parallel processing (20 concurrent), ~1-2 minutes for 100 creators
- **Caching**: Subsequent runs are much faster due to cached Farcaster data

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
1. API keys are loaded from environment variables
2. Rate limiting is respected
3. Data is cached to avoid redundant API calls

## Acknowledgments

- [Zora](https://zora.co/) - Creator coin platform
- [Farcaster](https://www.farcaster.xyz/) - Decentralized social network
- [Neynar](https://neynar.com/) - Farcaster API provider
- [Google Gemini](https://ai.google.dev/) - AI classification model
