#!/usr/bin/env bun

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const CLASSIFICATION_CATEGORIES = [
  'Builder - Creates tools, apps, technical projects, infrastructure, open source software, launches products',
  'Creative - Creates art, design, music, visual content, memes, creative expression, digital collectibles',
  'Influencer - Well-known industry figures (typically >50k followers) who primarily share insights, commentary, and opinions. May have technical backgrounds but current content focuses on thought leadership rather than active product development',
  'Lifestyle - Personal updates, daily life, travel, food, fitness, wellness, personal brand, general social engagement'
];

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

**Examples:**
- **Influencer**: Balaji (founder but now focuses on macro commentary and predictions), Jacob Horne (works at Zora but shares industry insights and thought leadership), Vitalik (technical background but primarily thought leader), influential VCs who share market insights
- **Builder**: Someone actively shipping products, writing code, launching new tools/apps, working on infrastructure
- **Creative**: Artists minting NFTs, musicians releasing songs, designers sharing work, photographers
- **Lifestyle**: Fitness journeys, food content, travel updates, personal daily life

**Task:**
Analyze this user's bio and cast content to determine their primary creator classification. Pay special attention to follower count and whether content is primarily thought leadership/commentary (Influencer) vs active building/shipping (Builder).

Provide your response in the following JSON format:
{
  "primary_classification": "<one of: Builder, Creative, Influencer, Lifestyle>",
  "confidence": "<High, Medium, or Low>",
  "reasoning": "<2-3 sentences explaining your classification based on their bio and cast content>",
  "secondary_traits": ["<optional list of other notable traits>"]
}

Only respond with the JSON, no additional text.`;

  console.log(`  Sending ${cast_texts.length} casts to Gemini for classification...`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
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

async function processCastFiles() {
  const castsDir = 'casts';

  // Check if casts directory exists
  if (!fs.existsSync(castsDir)) {
    console.error(`Error: Directory '${castsDir}' does not exist`);
    process.exit(1);
  }

  // Get all JSON files in the casts directory
  const files = fs.readdirSync(castsDir).filter(file => file.endsWith('.json'));

  if (files.length === 0) {
    console.error(`Error: No JSON files found in '${castsDir}' directory`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Found ${files.length} cast file(s) to process`);
  console.log('='.repeat(60));

  const results = [];

  for (const file of files) {
    const filePath = path.join(castsDir, file);
    console.log(`\nProcessing: ${file}`);

    try {
      const castData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Validate the data structure
      if (!castData.cast_texts || !castData.user) {
        console.error(`  Skipping ${file}: Invalid data structure`);
        continue;
      }

      const classification = await classifyCreator(castData);
      results.push(classification);

      console.log(`  ✓ Classified as: ${classification.primary_classification || 'Error'}`);
      if (classification.confidence) {
        console.log(`  Confidence: ${classification.confidence}`);
      }
      if (classification.reasoning) {
        console.log(`  Reasoning: ${classification.reasoning}`);
      }

      // Small delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`  Error processing ${file}:`, error.message);
      results.push({
        file,
        error: error.message,
        analyzed_at: new Date().toISOString()
      });
    }
  }

  // Save results
  const outputFile = 'creator-classifications.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('Classification Complete!');
  console.log('='.repeat(60));
  console.log(`Results saved to: ${outputFile}`);
  console.log(`Total classifications: ${results.filter(r => !r.error).length}`);
  console.log(`Errors: ${results.filter(r => r.error).length}\n`);

  // Print summary stats
  if (results.length > 0) {
    const classifications = results.filter(r => r.primary_classification);
    if (classifications.length > 0) {
      console.log('Classification Breakdown:');
      const counts = {};
      classifications.forEach(c => {
        counts[c.primary_classification] = (counts[c.primary_classification] || 0) + 1;
      });
      Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
  }
}

async function main() {
  try {
    await processCastFiles();
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
