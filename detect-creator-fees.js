#!/usr/bin/env bun

import { createPublicClient, http, parseAbiItem, formatUnits } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL;
const HOOK_ADDRESS = "0x9278F6e55cE58519C79dC1ab0Ad3b29EA7821040";
const ZORA_TOKEN = "0x1111111111166b7FE7bd91427724B487980aFc69";

// CreatorCoinRewards event from CreatorCoinHook
const CREATOR_COIN_REWARDS_EVENT = parseAbiItem(
  "event CreatorCoinRewards(address indexed coin, address currency, address creator, address protocol, uint256 creatorAmount, uint256 protocolAmount)"
);

const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

async function getCreatorFeesForCoin(coinAddress) {
  console.log(`Fetching fees for ${coinAddress}...`);

  try {
    // Query all CreatorCoinRewards events for this coin
    const logs = await client.getLogs({
      address: HOOK_ADDRESS,
      event: CREATOR_COIN_REWARDS_EVENT,
      args: {
        coin: coinAddress,
      },
      fromBlock: 0n,
      toBlock: "latest",
    });

    // Sum up all creatorAmount values
    let totalCreatorFees = 0n;
    for (const log of logs) {
      totalCreatorFees += log.args.creatorAmount;
    }

    // Convert from wei to ZORA tokens (18 decimals)
    const totalFeesFormatted = formatUnits(totalCreatorFees, 18);

    return {
      coinAddress,
      totalFeesWei: totalCreatorFees.toString(),
      totalFeesZORA: totalFeesFormatted,
      eventCount: logs.length,
    };
  } catch (error) {
    console.error(`Error fetching fees for ${coinAddress}:`, error.message);
    return {
      coinAddress,
      error: error.message,
    };
  }
}

async function main() {
  // Read coin addresses from JSON files
  const featuredCreators = await Bun.file("zora-featured-creators.json").json();
  const mostValuableCreators = await Bun.file("zora-most-valuable-creators.json").json();

  // Combine and deduplicate
  const allCoins = [...featuredCreators, ...mostValuableCreators];
  const uniqueCoins = Array.from(
    new Map(allCoins.map((item) => [item.coin.address.toLowerCase(), item])).values()
  );

  console.log(`\nAnalyzing ${uniqueCoins.length} unique coins...\n`);

  // Process coins in batches to avoid rate limiting
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < uniqueCoins.length; i += BATCH_SIZE) {
    const batch = uniqueCoins.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueCoins.length / BATCH_SIZE)}...`);

    const batchResults = await Promise.all(
      batch.map((coin) => getCreatorFeesForCoin(coin.coin.address))
    );

    results.push(...batchResults);

    // Small delay between batches
    if (i + BATCH_SIZE < uniqueCoins.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Merge results with coin metadata
  const enrichedResults = results.map((result) => {
    const coinData = uniqueCoins.find(
      (c) => c.coin.address.toLowerCase() === result.coinAddress.toLowerCase()
    );

    return {
      ...result,
      name: coinData?.coin.name,
      symbol: coinData?.coin.symbol,
      creator: coinData?.creator,
    };
  });

  // Sort by total fees (highest first)
  enrichedResults.sort((a, b) => {
    const aFees = parseFloat(a.totalFeesZORA || "0");
    const bFees = parseFloat(b.totalFeesZORA || "0");
    return bFees - aFees;
  });

  // Save results
  const outputFile = "creator-fees-results.json";
  await Bun.write(outputFile, JSON.stringify(enrichedResults, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Analysis Complete!");
  console.log("=".repeat(60));
  console.log(`Results saved to: ${outputFile}\n`);

  // Print top 10
  console.log("Top 10 Coins by Creator Fees:\n");
  enrichedResults.slice(0, 10).forEach((result, idx) => {
    if (!result.error) {
      console.log(`${idx + 1}. ${result.name || result.coinAddress}`);
      console.log(`   Total Fees: ${parseFloat(result.totalFeesZORA).toFixed(4)} ZORA`);
      console.log(`   Swaps: ${result.eventCount}`);
      console.log(`   Creator: ${result.creator?.handle || "Unknown"}\n`);
    }
  });

  // Print summary stats
  const totalFees = enrichedResults.reduce(
    (sum, r) => sum + parseFloat(r.totalFeesZORA || "0"),
    0
  );
  const coinsWithFees = enrichedResults.filter((r) => parseFloat(r.totalFeesZORA || "0") > 0).length;

  console.log(`\nSummary:`);
  console.log(`  Total coins analyzed: ${enrichedResults.length}`);
  console.log(`  Coins with fees earned: ${coinsWithFees}`);
  console.log(`  Total creator fees: ${totalFees.toFixed(4)} ZORA`);
}

main().catch(console.error);
