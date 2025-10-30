#!/usr/bin/env bun

async function getCreatorEarningsForHandle(handle) {
  console.log(`Fetching earnings for ${handle}...`);

  try {
    const response = await fetch('https://api.zora.co/universal/graphql', {
      method: 'POST',
      headers: {
        'accept': 'multipart/mixed, application/json',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'origin': 'https://zora.co',
      },
      body: JSON.stringify({
        hash: '275e97dffd615f930c83f157c168399f',
        variables: { profileId: handle },
        operationName: 'UserProfileViewQuery',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Extract creatorEarnings array and sum all amounts
    const creatorEarnings = data?.data?.profile?.creatorCoin?.creatorEarnings || [];
    const totalEarnings = creatorEarnings.reduce((sum, earning) => {
      return sum + parseFloat(earning.amountUsd || 0);
    }, 0);

    return {
      handle,
      totalEarningsUsd: totalEarnings.toFixed(2),
      earningsCount: creatorEarnings.length,
      coinAddress: data?.data?.profile?.creatorCoin?.address || null,
    };
  } catch (error) {
    console.error(`Error fetching earnings for ${handle}:`, error.message);
    return {
      handle,
      error: error.message,
    };
  }
}

async function main() {
  // Read coin addresses from JSON files
  const featuredCreators = await Bun.file("zora-featured-creators.json").json();
  const mostValuableCreators = await Bun.file("zora-most-valuable-creators.json").json();

  // Combine and deduplicate by handle
  const allCreators = [...featuredCreators, ...mostValuableCreators];
  const uniqueCreators = Array.from(
    new Map(allCreators.map((item) => [item.creator.handle.toLowerCase(), item])).values()
  );

  console.log(`\nAnalyzing ${uniqueCreators.length} unique creators...\n`);

  // Process creators in batches to avoid rate limiting
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < uniqueCreators.length; i += BATCH_SIZE) {
    const batch = uniqueCreators.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueCreators.length / BATCH_SIZE)}...`);

    const batchResults = await Promise.all(
      batch.map((creator) => getCreatorEarningsForHandle(creator.creator.handle))
    );

    results.push(...batchResults);

    // Small delay between batches
    if (i + BATCH_SIZE < uniqueCreators.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Merge results with creator metadata
  const enrichedResults = results.map((result) => {
    const creatorData = uniqueCreators.find(
      (c) => c.creator.handle.toLowerCase() === result.handle.toLowerCase()
    );

    return {
      ...result,
      displayName: creatorData?.creator.displayName,
      socials: creatorData?.creator.socials,
      coinSymbol: creatorData?.coin.symbol,
      marketCap: creatorData?.coin.marketCap,
    };
  });

  // Sort by total earnings (highest first)
  enrichedResults.sort((a, b) => {
    const aEarnings = parseFloat(a.totalEarningsUsd || "0");
    const bEarnings = parseFloat(b.totalEarningsUsd || "0");
    return bEarnings - aEarnings;
  });

  // Save results
  const outputFile = "creator-fees-api-results.json";
  await Bun.write(outputFile, JSON.stringify(enrichedResults, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log("Analysis Complete!");
  console.log("=".repeat(60));
  console.log(`Results saved to: ${outputFile}\n`);

  // Print top 10
  console.log("Top 10 Creators by Earnings:\n");
  enrichedResults.slice(0, 10).forEach((result, idx) => {
    if (!result.error) {
      console.log(`${idx + 1}. ${result.displayName || result.handle}`);
      console.log(`   Handle: @${result.handle}`);
      console.log(`   Total Earnings: $${parseFloat(result.totalEarningsUsd).toFixed(2)} USD`);
      console.log(`   Earnings Records: ${result.earningsCount}`);
      console.log(`   Market Cap: $${result.marketCap || "Unknown"}\n`);
    }
  });

  // Print summary stats
  const totalEarnings = enrichedResults.reduce(
    (sum, r) => sum + parseFloat(r.totalEarningsUsd || "0"),
    0
  );
  const creatorsWithEarnings = enrichedResults.filter((r) => parseFloat(r.totalEarningsUsd || "0") > 0).length;

  console.log(`\nSummary:`);
  console.log(`  Total creators analyzed: ${enrichedResults.length}`);
  console.log(`  Creators with earnings: ${creatorsWithEarnings}`);
  console.log(`  Total creator earnings: $${totalEarnings.toFixed(2)} USD`);
}

main().catch(console.error);
