#!/usr/bin/env python3

import os
import json
import asyncio
import aiohttp
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
from google import genai
from google.genai import types
from tqdm.asyncio import tqdm_asyncio

# Configuration
NEYNAR_API_KEY = os.getenv('NEYNAR_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
CASTS_DIR = Path('./casts')
CONCURRENT_REQUESTS = 20
RETRY_ATTEMPTS = 3
RETRY_DELAY = 2  # seconds

CLASSIFICATION_CATEGORIES = [
    'Builder - Creates tools, apps, technical projects, infrastructure, open source software, launches products',
    'Creative - Creates art, design, music, visual content, memes, creative expression, digital collectibles',
    'Influencer - Well-known industry figures (typically >50k followers) who primarily share insights, commentary, and opinions. May have technical backgrounds but current content focuses on thought leadership rather than active product development',
    'Lifestyle - Personal updates, daily life, travel, food, fitness, wellness, personal brand, general social engagement'
]

if not NEYNAR_API_KEY:
    print('Error: NEYNAR_API_KEY environment variable is not set')
    exit(1)

if not GEMINI_API_KEY:
    print('Error: GEMINI_API_KEY environment variable is not set')
    exit(1)

# Create casts directory
CASTS_DIR.mkdir(exist_ok=True)

# Configure Gemini
client = genai.Client(api_key=GEMINI_API_KEY)


async def fetch_with_retry(session: aiohttp.ClientSession, url: str, headers: dict, max_retries: int = RETRY_ATTEMPTS) -> Optional[dict]:
    """Fetch URL with retry logic."""
    for attempt in range(max_retries):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 429:  # Rate limit
                    wait_time = RETRY_DELAY * (2 ** attempt)
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    return None
        except Exception as e:
            if attempt == max_retries - 1:
                return None
            await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
    return None


async def get_user_by_username(session: aiohttp.ClientSession, username: str) -> Optional[dict]:
    """Fetch Farcaster user by username."""
    url = f'https://api.neynar.com/v2/farcaster/user/by_username?username={username}'
    headers = {'x-api-key': NEYNAR_API_KEY}

    data = await fetch_with_retry(session, url, headers)
    if data:
        return data.get('user')
    return None


async def get_popular_casts(session: aiohttp.ClientSession, fid: int, limit: int = 10) -> Optional[list]:
    """Fetch popular casts for a user."""
    url = f'https://api.neynar.com/v2/farcaster/feed/user/popular?fid={fid}&limit={limit}'
    headers = {'x-api-key': NEYNAR_API_KEY}

    data = await fetch_with_retry(session, url, headers)
    if data:
        return data.get('casts', [])
    return None


async def fetch_casts_for_user(session: aiohttp.ClientSession, username: str, semaphore: asyncio.Semaphore) -> tuple[bool, str]:
    """Fetch and save casts for a user."""
    async with semaphore:
        output_file = CASTS_DIR / f'{username}-casts.json'

        # Check if already exists
        if output_file.exists():
            return True, 'cached'

        # Get user info
        user = await get_user_by_username(session, username)
        if not user:
            return False, 'user_fetch_failed'

        # Get popular casts
        casts = await get_popular_casts(session, user['fid'])
        if casts is None:
            return False, 'casts_fetch_failed'

        # Save to file
        data = {
            'cast_texts': [cast.get('text', '') for cast in casts],
            'user': {
                'fid': user.get('fid'),
                'username': user.get('username'),
                'display_name': user.get('display_name'),
                'pfp_url': user.get('pfp_url'),
                'follower_count': user.get('follower_count'),
                'following_count': user.get('following_count')
            },
            'casts': casts,
            'fetched_at': datetime.utcnow().isoformat()
        }

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)

        return True, 'fetched'


async def classify_creator(cast_data: dict, semaphore: asyncio.Semaphore) -> dict:
    """Classify a creator using Gemini AI."""
    async with semaphore:
        cast_texts = cast_data.get('cast_texts', [])
        user = cast_data.get('user', {})
        casts = cast_data.get('casts', [])

        # Extract bio
        bio = 'No bio available'
        if casts and len(casts) > 0:
            bio = casts[0].get('author', {}).get('profile', {}).get('bio', {}).get('text', 'No bio available')

        # Prepare prompt
        cast_content = '\n\n'.join([f"{i+1}. {text}" for i, text in enumerate(cast_texts)])
        categories = '\n'.join([f"{i+1}. {cat}" for i, cat in enumerate(CLASSIFICATION_CATEGORIES)])

        prompt = f"""You are analyzing a Farcaster (decentralized social media) user to classify their primary creator type.

**User Information:**
- Username: {user.get('username')}
- Display Name: {user.get('display_name')}
- Bio: {bio}
- Follower Count: {user.get('follower_count')}
- Following Count: {user.get('following_count')}

**Recent Cast Content ({len(cast_texts)} casts):**
{cast_content}

**Classification Categories:**
{categories}

**Examples:**
- **Influencer**: Balaji (founder but now focuses on macro commentary and predictions), Jacob Horne (works at Zora but shares industry insights and thought leadership), Vitalik (technical background but primarily thought leader), influential VCs who share market insights
- **Builder**: Someone actively shipping products, writing code, launching new tools/apps, working on infrastructure
- **Creative**: Artists minting NFTs, musicians releasing songs, designers sharing work, photographers
- **Lifestyle**: Fitness journeys, food content, travel updates, personal daily life

**Task:**
Analyze this user's bio and cast content to determine their primary creator classification. Pay special attention to follower count and whether content is primarily thought leadership/commentary (Influencer) vs active building/shipping (Builder).

Provide your response in the following JSON format:
{{
  "primary_classification": "<one of: Builder, Creative, Influencer, Lifestyle>",
  "confidence": "<High, Medium, or Low>",
  "reasoning": "<2-3 sentences explaining your classification based on their bio and cast content>",
  "secondary_traits": ["<optional list of other notable traits>"]
}}

Only respond with the JSON, no additional text."""

        try:
            # Generate content with retry
            for attempt in range(RETRY_ATTEMPTS):
                try:
                    response = await client.aio.models.generate_content(
                        model='gemini-flash-lite-latest',
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.3,
                            max_output_tokens=500
                        )
                    )

                    response_text = response.text.strip()

                    # Extract JSON
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', response_text)
                    if not json_match:
                        raise ValueError('No JSON found in response')

                    classification = json.loads(json_match.group(0))

                    return {
                        'username': user.get('username'),
                        'display_name': user.get('display_name'),
                        'bio': bio,
                        'follower_count': user.get('follower_count'),
                        'casts_analyzed': len(cast_texts),
                        **classification,
                        'analyzed_at': datetime.utcnow().isoformat()
                    }

                except Exception as e:
                    if attempt == RETRY_ATTEMPTS - 1:
                        raise
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))

        except Exception as e:
            return {
                'username': user.get('username'),
                'display_name': user.get('display_name'),
                'error': str(e),
                'analyzed_at': datetime.utcnow().isoformat()
            }


async def main():
    print('\n' + '=' * 60)
    print('BATCH CREATOR CLASSIFICATION PIPELINE (Python + Async)')
    print('=' * 60)

    # Step 1: Load creator fees data
    print('\n📂 Step 1: Loading creator fees data...')
    with open('creator-fees-api-results.json', 'r') as f:
        creators_data = json.load(f)
    print(f'  Loaded {len(creators_data)} creators with fee data')

    # Step 2: Filter to those with Farcaster profiles
    print('\n🔍 Step 2: Filtering to creators with Farcaster profiles...')

    # Debug: Check what's in the data
    print('\n  Debugging first 3 creators:')
    for i, c in enumerate(creators_data[:3]):
        print(f'  Creator {i}: type={type(c)}, value={c}')
        if c is not None:
            print(f'    Has socials: {c.get("socials")}')
            socials = c.get('socials')
            if socials is not None:
                print(f'    socials type: {type(socials)}')
                print(f'    Has farcaster: {socials.get("farcaster") if isinstance(socials, dict) else "N/A"}')

    creators_with_farcaster = []
    for c in creators_data:
        if c is None:
            continue
        socials = c.get('socials')
        if socials is None or not isinstance(socials, dict):
            continue
        farcaster = socials.get('farcaster')
        if farcaster is None or not isinstance(farcaster, dict):
            continue
        username = farcaster.get('username')
        if username:
            creators_with_farcaster.append(c)

    print(f'\n  Found {len(creators_with_farcaster)} creators with Farcaster profiles')

    # Step 3: Fetch casts for each creator
    print(f'\n📥 Step 3: Fetching casts from Farcaster ({CONCURRENT_REQUESTS} concurrent)...')

    async with aiohttp.ClientSession() as session:
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

        tasks = []
        for creator in creators_with_farcaster:
            username = creator['socials']['farcaster']['username']
            tasks.append(fetch_casts_for_user(session, username, semaphore))

        results = []
        for coro in tqdm_asyncio.as_completed(tasks, desc='Fetching casts'):
            result = await coro
            results.append(result)

        fetched = sum(1 for success, status in results if success and status == 'fetched')
        cached = sum(1 for success, status in results if success and status == 'cached')
        errors = sum(1 for success, _ in results if not success)

        print(f'\n  Summary: {fetched} fetched, {cached} cached, {errors} errors')

    # Step 4: Classify all creators
    print(f'\n🤖 Step 4: Classifying creators with Gemini AI ({CONCURRENT_REQUESTS} concurrent)...')

    classification_tasks = []
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

    for creator in creators_with_farcaster:
        username = creator['socials']['farcaster']['username']
        cast_file = CASTS_DIR / f'{username}-casts.json'

        if cast_file.exists():
            with open(cast_file, 'r') as f:
                cast_data = json.load(f)

            if cast_data.get('cast_texts'):
                classification_tasks.append((classify_creator(cast_data, semaphore), creator))

    classifications = []

    async def process_classification(task, creator):
        classification = await task
        # Merge with creator earnings data
        enriched = {
            **classification,
            'earnings_usd': creator.get('totalEarningsUsd'),
            'coin_address': creator.get('coinAddress'),
            'market_cap': creator.get('marketCap'),
            'zora_handle': creator.get('handle')
        }
        return enriched

    tasks_with_creators = [process_classification(task, creator) for task, creator in classification_tasks]

    for coro in tqdm_asyncio.as_completed(tasks_with_creators, desc='Classifying'):
        result = await coro
        classifications.append(result)

    # Step 5: Save results
    print('\n💾 Step 5: Saving results...')
    output_file = 'creator-classifications-with-earnings.json'
    with open(output_file, 'w') as f:
        json.dump(classifications, f, indent=2)

    print('\n' + '=' * 60)
    print('✅ BATCH CLASSIFICATION COMPLETE!')
    print('=' * 60)
    print(f'\nResults saved to: {output_file}')
    print(f'Total classified: {len([c for c in classifications if not c.get("error")])}')
    print(f'Errors: {len([c for c in classifications if c.get("error")])}')

    # Print classification breakdown
    if classifications:
        successful = [c for c in classifications if c.get('primary_classification')]
        if successful:
            print('\n📊 Classification Breakdown:')
            counts = {}
            for c in successful:
                cat = c['primary_classification']
                counts[cat] = counts.get(cat, 0) + 1

            for cat, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / len(successful)) * 100
                print(f'  {cat}: {count} ({percentage:.1f}%)')

            # Top 5 earners
            print('\n💰 Top 5 Earners:')
            top_earners = sorted(successful, key=lambda x: float(x.get('earnings_usd', 0)), reverse=True)[:5]
            for i, c in enumerate(top_earners, 1):
                earnings = float(c.get('earnings_usd', 0))
                print(f"  {i}. @{c['username']} ({c['primary_classification']}): ${earnings:,.2f} USD")

    print()


if __name__ == '__main__':
    asyncio.run(main())
