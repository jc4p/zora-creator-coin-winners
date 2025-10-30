#!/usr/bin/env bun

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CASTS_DIR = './casts';
const BATCH_SIZE = 5; // Process 5 creators at a time
const DELAY_BETWEEN_FETCHES = 2000; // 2 seconds between Neynar API calls
const DELAY_BETWEEN_CLASSIFICATIONS = 1500; // 1.5 seconds between Gemini calls

if (!NEYNAR_API_KEY) {
  console.error('Error: NEYNAR_API_KEY environment variable is not set');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

// Create casts directory if it doesn't exist
if (!fs.existsSync(CASTS_DIR)) {
  fs.mkdirSync(CASTS_DIR, { recursive: true });
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const CLASSIFICATION_CATEGORIES = [
  'Builder - Creates tools, apps, technical projects, infrastructure, open source software',
  'Creative - Creates art, design, music, visual content, memes, creative expression',
  'Web2 Native - Content and engagement style focused on traditional social media, mainstream topics',
  'Web3 Native - Deep involvement in crypto, NFTs, DAOs, DeFi, blockchain culture and terminology',
  'Lifestyle - Personal updates, daily life, travel, food, fitness, wellness, personal brand'
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUserByUsername(username) {
  const url = `https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': NEYNAR_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error(`  Error fetching user ${username}:`, error.message);
    return null;
  }
}

async function getPopularCasts(fid, limit = 10) {
  const url = `https://api.neynar.com/v2/farcaster/feed/user/popular?fid=${fid}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': NEYNAR_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.casts;
  } catch (error) {
    console.error(`  Error fetching casts for FID ${fid}:`, error.message);
    return null;
  }
}

async function fetchCastsForUser(username) {
  const outputFile = path.join(CASTS_DIR, `${username}-casts.json`);

  // Check if casts already exist
  if (fs.existsSync(outputFile)) {
    console.log(`  ✓ Casts already fetched (skipping)`);
    return true;
  }

  // Get user info
  const user = await getUserByUsername(username);
  if (!user) {
    console.error(`  ✗ Failed to fetch user info`);
    return false;
  }

  // Get popular casts
  const casts = await getPopularCasts(user.fid);
  if (!casts) {
    console.error(`  ✗ Failed to fetch casts`);
    return false;
  }

  console.log(`  ✓ Retrieved ${casts.length} popular casts`);

  // Save to file
  const data = {
    cast_texts: casts.map(cast => cast.text),
    user: {
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      follower_count: user.follower_count,
      following_count: user.following_count
    },
    casts: casts,
    fetched_at: new Date().toISOString()
  };

  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  console.log(`  ✓ Saved to ${outputFile}`);

  return true;
}

async function classifyCreator(castData) {
  const { cast_texts, user, casts } = castData;

  // Extract bio from the first cast's author profile
  const bio = casts?.[0]?.author?.profile?.bio?.text || 'No bio available';

  // Prepare the prompt with creator data
  const prompt = `You are analyzing a Farcaster (decentralized social media) user to classify their primary creator type.

**User Information:**
- Username: ${user.username}
- Display Name: ${user.display_name}
- Bio: ${bio}
- Follower Count: ${user.follower_count}
- Following Count: ${user.following_count}

**Recent Cast Content (${cast_texts.length} casts):**
${cast_texts.map((text, i) => `${i + 1}. ${text}`).join('\n\n')}

**Classification Categories:**
${CLASSIFICATION_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

**Task:**
Analyze this user's bio and cast content to determine their primary creator classification.

Provide your response in the following JSON format:
{
  "primary_classification": "<one of: Builder, Creative, Web2 Native, Web3 Native, Lifestyle>",
  "confidence": "<High, Medium, or Low>",
  "reasoning": "<2-3 sentences explaining your classification based on their bio and cast content>",
  "secondary_traits": ["<optional list of other notable traits>"]
}

Only respond with the JSON, no additional text.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest',
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500
      }
    });

    const responseText = response.text?.trim();

    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    // Try to extract JSON from the response
    let jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('  Warning: Could not extract JSON from response:', responseText);
      throw new Error('Invalid JSON response');
    }

    const classification = JSON.parse(jsonMatch[0]);

    return {
      username: user.username,
      display_name: user.display_name,
      bio,
      follower_count: user.follower_count,
      casts_analyzed: cast_texts.length,
      ...classification,
      analyzed_at: new Date().toISOString()
    };
  } catch (error) {
    console.error(`  Error classifying ${user.username}:`, error.message);
    return {
      username: user.username,
      display_name: user.display_name,
      error: error.message,
      analyzed_at: new Date().toISOString()
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('BATCH CREATOR CLASSIFICATION PIPELINE');
  console.log('='.repeat(60));

  // Step 1: Load creator fees data
  console.log('\n📂 Step 1: Loading creator fees data...');
  const creatorsData = JSON.parse(fs.readFileSync('creator-fees-api-results.json', 'utf-8'));
  console.log(`  Loaded ${creatorsData.length} creators with fee data`);

  // Step 2: Filter to those with Farcaster profiles
  console.log('\n🔍 Step 2: Filtering to creators with Farcaster profiles...');
  const creatorsWithFarcaster = creatorsData.filter(creator =>
    creator.socials?.farcaster?.username
  );
  console.log(`  Found ${creatorsWithFarcaster.length} creators with Farcaster profiles`);

  // Step 3: Fetch casts for each creator
  console.log('\n📥 Step 3: Fetching casts from Farcaster...');
  let fetchedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < creatorsWithFarcaster.length; i++) {
    const creator = creatorsWithFarcaster[i];
    const username = creator.socials.farcaster.username;

    console.log(`\n[${i + 1}/${creatorsWithFarcaster.length}] Processing @${username}...`);

    const outputFile = path.join(CASTS_DIR, `${username}-casts.json`);

    if (fs.existsSync(outputFile)) {
      console.log(`  ✓ Casts already fetched (skipping)`);
      skippedCount++;
    } else {
      const success = await fetchCastsForUser(username);
      if (success) {
        fetchedCount++;
      } else {
        errorCount++;
      }

      // Delay between fetches to respect rate limits
      if (i < creatorsWithFarcaster.length - 1) {
        await sleep(DELAY_BETWEEN_FETCHES);
      }
    }
  }

  console.log(`\n  Summary: ${fetchedCount} fetched, ${skippedCount} skipped, ${errorCount} errors`);

  // Step 4: Classify all creators
  console.log('\n🤖 Step 4: Classifying creators with Gemini AI...');
  const classifications = [];

  for (let i = 0; i < creatorsWithFarcaster.length; i++) {
    const creator = creatorsWithFarcaster[i];
    const username = creator.socials.farcaster.username;
    const castFile = path.join(CASTS_DIR, `${username}-casts.json`);

    console.log(`\n[${i + 1}/${creatorsWithFarcaster.length}] Classifying @${username}...`);

    if (!fs.existsSync(castFile)) {
      console.log(`  ✗ No casts file found (skipping)`);
      continue;
    }

    try {
      const castData = JSON.parse(fs.readFileSync(castFile, 'utf-8'));

      if (!castData.cast_texts || castData.cast_texts.length === 0) {
        console.log(`  ✗ No cast texts available (skipping)`);
        continue;
      }

      const classification = await classifyCreator(castData);

      // Merge with creator earnings data
      const enrichedClassification = {
        ...classification,
        earnings_usd: creator.totalEarningsUsd,
        coin_address: creator.coinAddress,
        market_cap: creator.marketCap,
        zora_handle: creator.handle
      };

      classifications.push(enrichedClassification);

      console.log(`  ✓ Classified as: ${classification.primary_classification || 'Error'}`);
      if (classification.confidence) {
        console.log(`  Confidence: ${classification.confidence}`);
      }
      if (classification.reasoning) {
        console.log(`  Reasoning: ${classification.reasoning.substring(0, 100)}...`);
      }

      // Delay between classifications to respect rate limits
      if (i < creatorsWithFarcaster.length - 1) {
        await sleep(DELAY_BETWEEN_CLASSIFICATIONS);
      }

    } catch (error) {
      console.error(`  ✗ Error processing:`, error.message);
    }
  }

  // Step 5: Save results
  console.log('\n💾 Step 5: Saving results...');
  const outputFile = 'creator-classifications-with-earnings.json';
  fs.writeFileSync(outputFile, JSON.stringify(classifications, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('✅ BATCH CLASSIFICATION COMPLETE!');
  console.log('='.repeat(60));
  console.log(`\nResults saved to: ${outputFile}`);
  console.log(`Total classified: ${classifications.filter(c => !c.error).length}`);
  console.log(`Errors: ${classifications.filter(c => c.error).length}`);

  // Print classification breakdown
  if (classifications.length > 0) {
    const successfulClassifications = classifications.filter(c => c.primary_classification);
    if (successfulClassifications.length > 0) {
      console.log('\n📊 Classification Breakdown:');
      const counts = {};
      successfulClassifications.forEach(c => {
        counts[c.primary_classification] = (counts[c.primary_classification] || 0) + 1;
      });
      Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        const percentage = ((count / successfulClassifications.length) * 100).toFixed(1);
        console.log(`  ${type}: ${count} (${percentage}%)`);
      });

      // Top 5 earners by classification
      console.log('\n💰 Top 5 Earners:');
      successfulClassifications
        .sort((a, b) => parseFloat(b.earnings_usd) - parseFloat(a.earnings_usd))
        .slice(0, 5)
        .forEach((c, i) => {
          console.log(`  ${i + 1}. @${c.username} (${c.primary_classification}): $${parseFloat(c.earnings_usd).toLocaleString()} USD`);
        });
    }
  }

  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
