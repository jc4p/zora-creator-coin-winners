#!/usr/bin/env python3

import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Set style
sns.set_style("whitegrid")
sns.set_palette("husl")
plt.rcParams['figure.figsize'] = (12, 8)
plt.rcParams['font.size'] = 10

# Create analysis directory
ANALYSIS_DIR = Path('./analysis')
ANALYSIS_DIR.mkdir(exist_ok=True)

print('\n' + '=' * 80)
print('CREATOR CLASSIFICATION ANALYSIS')
print('=' * 80)

# Load data
print('\n📂 Loading data...')
with open('creator-classifications-with-earnings.json', 'r') as f:
    classifications = json.load(f)

with open('zora-featured-creators.json', 'r') as f:
    featured_creators = json.load(f)

# Create DataFrame
df = pd.DataFrame(classifications)

# Filter out errors and convert earnings to float
if 'error' in df.columns:
    df = df[~df['primary_classification'].isna() & df['error'].isna()].copy()
else:
    df = df[~df['primary_classification'].isna()].copy()
df['earnings_usd'] = pd.to_numeric(df['earnings_usd'], errors='coerce')
df['market_cap'] = pd.to_numeric(df['market_cap'], errors='coerce')
df['follower_count'] = pd.to_numeric(df['follower_count'], errors='coerce')

# Create Zora Stars indicator
featured_handles = {c['creator']['handle'].lower() for c in featured_creators if c and c.get('creator')}
df['is_zora_star'] = df['zora_handle'].str.lower().isin(featured_handles)

print(f'\n✓ Loaded {len(df)} creators')
print(f'  - Zora Stars: {df["is_zora_star"].sum()}')
print(f'  - Total Creators: {len(df)}')

# Split datasets
df_all = df.copy()
df_stars = df[df['is_zora_star']].copy()

print('\n' + '=' * 80)
print('OVERALL STATISTICS - ALL CREATORS')
print('=' * 80)

# Category distribution
print('\n📊 Category Distribution:')
category_counts = df_all['primary_classification'].value_counts()
for category, count in category_counts.items():
    pct = (count / len(df_all)) * 100
    print(f'  {category}: {count} ({pct:.1f}%)')

# Earnings statistics by category
print('\n💰 Earnings Statistics by Category (All Creators):')
print('-' * 80)

stats_all = df_all.groupby('primary_classification')['earnings_usd'].agg([
    ('count', 'count'),
    ('mean', 'mean'),
    ('median', 'median'),
    ('std', 'std'),
    ('min', 'min'),
    ('max', 'max'),
    ('total', 'sum')
]).round(2)

stats_all = stats_all.sort_values('median', ascending=False)
print(stats_all.to_string())

# Top earners per category
print('\n🏆 Top Earner per Category (All Creators):')
print('-' * 80)
for category in df_all['primary_classification'].unique():
    top = df_all[df_all['primary_classification'] == category].nlargest(1, 'earnings_usd').iloc[0]
    print(f'{category}: @{top["username"]} - ${float(top["earnings_usd"]):,.2f}')

if len(df_stars) > 0:
    print('\n' + '=' * 80)
    print('ZORA STARS ANALYSIS')
    print('=' * 80)

    print('\n📊 Category Distribution (Zora Stars):')
    category_counts_stars = df_stars['primary_classification'].value_counts()
    for category, count in category_counts_stars.items():
        pct = (count / len(df_stars)) * 100
        print(f'  {category}: {count} ({pct:.1f}%)')

    print('\n💰 Earnings Statistics by Category (Zora Stars Only):')
    print('-' * 80)

    stats_stars = df_stars.groupby('primary_classification')['earnings_usd'].agg([
        ('count', 'count'),
        ('mean', 'mean'),
        ('median', 'median'),
        ('std', 'std'),
        ('min', 'min'),
        ('max', 'max'),
        ('total', 'sum')
    ]).round(2)

    stats_stars = stats_stars.sort_values('median', ascending=False)
    print(stats_stars.to_string())

    print('\n🏆 Top Earner per Category (Zora Stars):')
    print('-' * 80)
    for category in df_stars['primary_classification'].unique():
        category_stars = df_stars[df_stars['primary_classification'] == category]
        if len(category_stars) > 0:
            top = category_stars.nlargest(1, 'earnings_usd').iloc[0]
            print(f'{category}: @{top["username"]} - ${float(top["earnings_usd"]):,.2f}')

# Create visualizations
print('\n' + '=' * 80)
print('CREATING VISUALIZATIONS')
print('=' * 80)

# 1. Category distribution pie charts
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

# All creators
category_counts.plot(kind='pie', ax=axes[0], autopct='%1.1f%%', startangle=90)
axes[0].set_title('Category Distribution - All Creators', fontsize=14, fontweight='bold')
axes[0].set_ylabel('')

# Zora Stars
if len(df_stars) > 0:
    category_counts_stars.plot(kind='pie', ax=axes[1], autopct='%1.1f%%', startangle=90)
    axes[1].set_title('Category Distribution - Zora Stars', fontsize=14, fontweight='bold')
    axes[1].set_ylabel('')

plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'category_distribution.png', dpi=300, bbox_inches='tight')
print('✓ Saved: category_distribution.png')
plt.close()

# 2. Box plot - Earnings by Category (All Creators)
fig, ax = plt.subplots(figsize=(14, 8))
sns.boxplot(data=df_all, x='primary_classification', y='earnings_usd', ax=ax)
ax.set_yscale('log')
ax.set_title('Earnings Distribution by Category - All Creators (Log Scale)', fontsize=14, fontweight='bold')
ax.set_xlabel('Category', fontsize=12)
ax.set_ylabel('Earnings (USD, Log Scale)', fontsize=12)
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'earnings_boxplot_all.png', dpi=300, bbox_inches='tight')
print('✓ Saved: earnings_boxplot_all.png')
plt.close()

# 3. Violin plot - Earnings by Category (All Creators)
fig, ax = plt.subplots(figsize=(14, 8))
sns.violinplot(data=df_all, x='primary_classification', y='earnings_usd', ax=ax)
ax.set_yscale('log')
ax.set_title('Earnings Distribution by Category - All Creators (Violin Plot, Log Scale)', fontsize=14, fontweight='bold')
ax.set_xlabel('Category', fontsize=12)
ax.set_ylabel('Earnings (USD, Log Scale)', fontsize=12)
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'earnings_violin_all.png', dpi=300, bbox_inches='tight')
print('✓ Saved: earnings_violin_all.png')
plt.close()

# 4. Box plot - Zora Stars
if len(df_stars) > 0:
    fig, ax = plt.subplots(figsize=(14, 8))
    sns.boxplot(data=df_stars, x='primary_classification', y='earnings_usd', ax=ax)
    ax.set_yscale('log')
    ax.set_title('Earnings Distribution by Category - Zora Stars Only (Log Scale)', fontsize=14, fontweight='bold')
    ax.set_xlabel('Category', fontsize=12)
    ax.set_ylabel('Earnings (USD, Log Scale)', fontsize=12)
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(ANALYSIS_DIR / 'earnings_boxplot_stars.png', dpi=300, bbox_inches='tight')
    print('✓ Saved: earnings_boxplot_stars.png')
    plt.close()

# 5. Comparison bar chart - Mean earnings
fig, ax = plt.subplots(figsize=(14, 8))
comparison_data = pd.DataFrame({
    'All Creators': df_all.groupby('primary_classification')['earnings_usd'].mean(),
    'Zora Stars': df_stars.groupby('primary_classification')['earnings_usd'].mean() if len(df_stars) > 0 else []
})
comparison_data.plot(kind='bar', ax=ax)
ax.set_title('Average Earnings by Category - Comparison', fontsize=14, fontweight='bold')
ax.set_xlabel('Category', fontsize=12)
ax.set_ylabel('Average Earnings (USD)', fontsize=12)
ax.legend(title='Group')
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'earnings_comparison_bar.png', dpi=300, bbox_inches='tight')
print('✓ Saved: earnings_comparison_bar.png')
plt.close()

# 6. Scatter plot - Followers vs Earnings
fig, ax = plt.subplots(figsize=(14, 8))
for category in df_all['primary_classification'].unique():
    category_data = df_all[df_all['primary_classification'] == category]
    ax.scatter(category_data['follower_count'], category_data['earnings_usd'],
               label=category, alpha=0.6, s=50)

ax.set_xscale('log')
ax.set_yscale('log')
ax.set_title('Follower Count vs Earnings by Category', fontsize=14, fontweight='bold')
ax.set_xlabel('Follower Count (Log Scale)', fontsize=12)
ax.set_ylabel('Earnings USD (Log Scale)', fontsize=12)
ax.legend(title='Category')
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'followers_vs_earnings.png', dpi=300, bbox_inches='tight')
print('✓ Saved: followers_vs_earnings.png')
plt.close()

# 7. Histogram - Earnings distribution
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
categories = df_all['primary_classification'].unique()

for idx, category in enumerate(categories):
    row = idx // 2
    col = idx % 2
    category_data = df_all[df_all['primary_classification'] == category]['earnings_usd']

    axes[row, col].hist(category_data, bins=30, edgecolor='black', alpha=0.7)
    axes[row, col].set_title(f'{category} - Earnings Distribution', fontsize=12, fontweight='bold')
    axes[row, col].set_xlabel('Earnings (USD)', fontsize=10)
    axes[row, col].set_ylabel('Count', fontsize=10)
    axes[row, col].set_yscale('log')

plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'earnings_histograms.png', dpi=300, bbox_inches='tight')
print('✓ Saved: earnings_histograms.png')
plt.close()

# 8. Top 20 earners
fig, ax = plt.subplots(figsize=(14, 10))
top_20 = df_all.nlargest(20, 'earnings_usd')
colors = [sns.color_palette()[list(df_all['primary_classification'].unique()).index(cat)]
          for cat in top_20['primary_classification']]

ax.barh(range(len(top_20)), top_20['earnings_usd'], color=colors)
ax.set_yticks(range(len(top_20)))
ax.set_yticklabels([f"@{row['username']} ({row['primary_classification']})"
                     for _, row in top_20.iterrows()])
ax.set_xlabel('Earnings (USD)', fontsize=12)
ax.set_title('Top 20 Earners Across All Categories', fontsize=14, fontweight='bold')
ax.invert_yaxis()
plt.tight_layout()
plt.savefig(ANALYSIS_DIR / 'top_20_earners.png', dpi=300, bbox_inches='tight')
print('✓ Saved: top_20_earners.png')
plt.close()

# Save summary report
print('\n💾 Saving summary report...')
with open(ANALYSIS_DIR / 'summary_report.txt', 'w') as f:
    f.write('=' * 80 + '\n')
    f.write('CREATOR CLASSIFICATION ANALYSIS REPORT\n')
    f.write('=' * 80 + '\n\n')

    f.write(f'Total Creators Analyzed: {len(df_all)}\n')
    f.write(f'Zora Stars: {len(df_stars)}\n\n')

    f.write('CATEGORY DISTRIBUTION (All Creators)\n')
    f.write('-' * 80 + '\n')
    for category, count in category_counts.items():
        pct = (count / len(df_all)) * 100
        f.write(f'{category}: {count} ({pct:.1f}%)\n')

    f.write('\n\nEARNINGS STATISTICS BY CATEGORY (All Creators)\n')
    f.write('-' * 80 + '\n')
    f.write(stats_all.to_string())

    f.write('\n\n\nTOP EARNER PER CATEGORY (All Creators)\n')
    f.write('-' * 80 + '\n')
    for category in df_all['primary_classification'].unique():
        top = df_all[df_all['primary_classification'] == category].nlargest(1, 'earnings_usd').iloc[0]
        f.write(f'{category}: @{top["username"]} - ${float(top["earnings_usd"]):,.2f}\n')

    if len(df_stars) > 0:
        f.write('\n\n' + '=' * 80 + '\n')
        f.write('ZORA STARS ANALYSIS\n')
        f.write('=' * 80 + '\n\n')

        f.write('CATEGORY DISTRIBUTION (Zora Stars)\n')
        f.write('-' * 80 + '\n')
        for category, count in category_counts_stars.items():
            pct = (count / len(df_stars)) * 100
            f.write(f'{category}: {count} ({pct:.1f}%)\n')

        f.write('\n\nEARNINGS STATISTICS BY CATEGORY (Zora Stars)\n')
        f.write('-' * 80 + '\n')
        f.write(stats_stars.to_string())

        f.write('\n\n\nTOP EARNER PER CATEGORY (Zora Stars)\n')
        f.write('-' * 80 + '\n')
        for category in df_stars['primary_classification'].unique():
            category_stars = df_stars[df_stars['primary_classification'] == category]
            if len(category_stars) > 0:
                top = category_stars.nlargest(1, 'earnings_usd').iloc[0]
                f.write(f'{category}: @{top["username"]} - ${float(top["earnings_usd"]):,.2f}\n')

print('✓ Saved: summary_report.txt')

print('\n' + '=' * 80)
print('✅ ANALYSIS COMPLETE!')
print('=' * 80)
print(f'\nAll visualizations and reports saved to: {ANALYSIS_DIR}/')
print('\nGenerated files:')
print('  - category_distribution.png')
print('  - earnings_boxplot_all.png')
print('  - earnings_violin_all.png')
print('  - earnings_boxplot_stars.png')
print('  - earnings_comparison_bar.png')
print('  - followers_vs_earnings.png')
print('  - earnings_histograms.png')
print('  - top_20_earners.png')
print('  - summary_report.txt')
print()
