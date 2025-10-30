#!/usr/bin/env bun

const fs = require('fs');
const path = require('path');

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const CASTS_DIR = './casts';

if (!NEYNAR_API_KEY) {
  console.error('Error: NEYNAR_API_KEY environment variable is not set');
  process.exit(1);
}

// Create casts directory if it doesn't exist
if (!fs.existsSync(CASTS_DIR)) {
  fs.mkdirSync(CASTS_DIR, { recursive: true });
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
    console.error(`Error fetching user ${username}:`, error.message);
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
    console.error(`Error fetching casts for FID ${fid}:`, error.message);
    return null;
  }
}

async function processCastsForUser(username) {
  console.log(`\nProcessing ${username}...`);

  // Get user info
  const user = await getUserByUsername(username);
  if (!user) {
    console.error(`Failed to fetch user info for ${username}`);
    return;
  }

  console.log(`Found user: ${user.display_name} (FID: ${user.fid})`);

  // Get popular casts
  const casts = await getPopularCasts(user.fid);
  if (!casts) {
    console.error(`Failed to fetch casts for ${username}`);
    return;
  }

  console.log(`Retrieved ${casts.length} popular casts`);

  // Save to file
  const outputFile = path.join(CASTS_DIR, `${username}-casts.json`);
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
  console.log(`Saved to ${outputFile}`);
}

async function main() {
  const usernames = process.argv.slice(2);

  if (usernames.length === 0) {
    console.log('Usage: bun fetch-casts.js <username1> [username2] [username3] ...');
    console.log('Example: bun fetch-casts.js jc4p');
    process.exit(1);
  }

  console.log(`Fetching casts for ${usernames.length} user(s)...`);

  for (const username of usernames) {
    await processCastsForUser(username);
  }

  console.log('\nDone!');
}

main();
