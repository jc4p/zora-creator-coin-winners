#!/usr/bin/env bun

const API_URL = 'https://api.zora.co/universal/graphql';
const QUERY_HASH = 'c2b3a1f16014905782a54053dc5a0aa4';
const OPERATION_NAME = 'TabsQueriesProvider_ExploreQuery';
const PAGE_SIZE = 18;
const MAX_ITEMS = 500;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If we get a 5xx error or 429 (rate limit), retry
      if (response.status >= 500 || response.status === 429) {
        if (attempt < retries) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          console.log(`  ⚠️  Got ${response.status} error, retrying in ${delay/1000}s... (attempt ${attempt + 1}/${retries})`);
          await sleep(delay);
          continue;
        }
      }

      return response;
    } catch (error) {
      // Network error - retry if we have attempts left
      if (attempt < retries) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.log(`  ⚠️  Network error: ${error.message}, retrying in ${delay/1000}s... (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

async function fetchPage(listType, after = null) {
  const variables = {
    first: PAGE_SIZE,
    listType: listType
  };

  if (after) {
    variables.after = after;
  }

  const response = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: {
      'accept': 'multipart/mixed, application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      hash: QUERY_HASH,
      variables,
      operationName: OPERATION_NAME
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function extractRelevantData(node) {
  const creator = node.creatorProfile;
  const socials = creator?.socialAccounts || {};

  return {
    coin: {
      address: node.address,
      chainId: node.chainId,
      name: node.name,
      symbol: node.symbol,
      totalVolume: node.totalVolume,
      volume24h: node.volume24h,
      uniqueHolders: node.uniqueHolders,
      marketCap: node.marketCap,
      marketCapDelta24h: node.marketCapDelta24h,
      createdAt: node.createdAt
    },
    creator: {
      handle: creator?.handle || null,
      displayName: creator?.displayName || null,
      socials: {
        farcaster: socials.farcaster ? {
          username: socials.farcaster.username,
          followerCount: socials.farcaster.followerCount
        } : null,
        twitter: socials.twitter ? {
          username: socials.twitter.username,
          followerCount: socials.twitter.followerCount
        } : null,
        instagram: socials.instagram ? {
          username: socials.instagram.username,
          followerCount: socials.instagram.followerCount
        } : null,
        tiktok: socials.tiktok ? {
          username: socials.tiktok.username,
          followerCount: socials.tiktok.followerCount
        } : null
      }
    }
  };
}

async function loadProgress(listType) {
  const progressFile = `progress-${listType.toLowerCase()}.json`;
  try {
    const file = Bun.file(progressFile);
    if (await file.exists()) {
      const progress = await file.json();
      console.log(`📂 Found progress file. Resuming from page ${progress.pageNum} (${progress.coins.length} coins collected)`);
      return progress;
    }
  } catch (error) {
    console.log(`No valid progress file found, starting fresh`);
  }
  return null;
}

async function saveProgress(listType, data) {
  const progressFile = `progress-${listType.toLowerCase()}.json`;
  await Bun.write(progressFile, JSON.stringify(data, null, 2));
}

async function clearProgress(listType) {
  const progressFile = `progress-${listType.toLowerCase()}.json`;
  try {
    await Bun.write(progressFile, '');
  } catch (error) {
    // Ignore errors when clearing
  }
}

async function fetchAllPages(listType) {
  // Try to load progress
  const progress = await loadProgress(listType);

  const allCoins = progress?.coins || [];
  let hasNextPage = true;
  let after = progress?.after || null;
  let pageNum = progress?.pageNum || 1;

  console.log(`Starting to fetch ${listType} data...\n`);

  while (hasNextPage && allCoins.length < MAX_ITEMS) {
    console.log(`Fetching page ${pageNum}...`);

    const data = await fetchPage(listType, after);
    const exploreList = data.data.exploreList;
    const edges = exploreList.edges || [];

    console.log(`  Retrieved ${edges.length} coins`);

    for (const edge of edges) {
      if (allCoins.length >= MAX_ITEMS) break;
      const coinData = extractRelevantData(edge.node);
      allCoins.push(coinData);
    }

    hasNextPage = exploreList.pageInfo?.hasNextPage || false;
    after = exploreList.pageInfo?.endCursor || null;

    console.log(`  Total collected: ${allCoins.length}`);
    console.log(`  Has next page: ${hasNextPage}\n`);

    // Save progress after each successful page
    await saveProgress(listType, {
      coins: allCoins,
      after,
      hasNextPage,
      pageNum: pageNum + 1,
      lastUpdated: new Date().toISOString()
    });

    pageNum++;

    // Small delay to be respectful to the API
    if (hasNextPage && allCoins.length < MAX_ITEMS) {
      await sleep(500);
    }
  }

  // Clear progress file when done
  await clearProgress(listType);

  return allCoins;
}

async function fetchAndSave(listType, filename) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${listType}`);
  console.log('='.repeat(60));

  const coins = await fetchAllPages(listType);

  console.log(`\nFetching complete! Total coins collected: ${coins.length}`);
  console.log(`Writing to ${filename}...`);

  await Bun.write(filename, JSON.stringify(coins, null, 2));

  console.log('✓ Data saved successfully!');

  // Print some stats
  const withTwitter = coins.filter(c => c.creator.socials.twitter).length;
  const withFarcaster = coins.filter(c => c.creator.socials.farcaster).length;
  const withInstagram = coins.filter(c => c.creator.socials.instagram).length;
  const withTiktok = coins.filter(c => c.creator.socials.tiktok).length;

  console.log('\nStats:');
  console.log(`  Total coins: ${coins.length}`);
  console.log(`  With Twitter: ${withTwitter}`);
  console.log(`  With Farcaster: ${withFarcaster}`);
  console.log(`  With Instagram: ${withInstagram}`);
  console.log(`  With TikTok: ${withTiktok}`);
}

async function main() {
  try {
    const listTypes = [
      { type: 'FEATURED_CREATORS', file: 'zora-featured-creators.json' },
      { type: 'MOST_VALUABLE_CREATORS', file: 'zora-most-valuable-creators.json' }
    ];

    for (const { type, file } of listTypes) {
      await fetchAndSave(type, file);
      // Delay between different list types
      await sleep(1000);
    }

    console.log('\n' + '='.repeat(60));
    console.log('All data fetched successfully! ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
