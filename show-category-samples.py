#!/usr/bin/env python3

import json
import random

# Load the classifications
with open('creator-classifications-with-earnings.json', 'r') as f:
    classifications = json.load(f)

# Filter successful classifications
successful = [c for c in classifications if c.get('primary_classification')]

# Group by category
categories = {}
for c in successful:
    cat = c['primary_classification']
    if cat not in categories:
        categories[cat] = []
    categories[cat].append(c)

# Show 10 random examples from each category
print('\n' + '=' * 80)
print('RANDOM EXAMPLES BY CATEGORY')
print('=' * 80)

for category in sorted(categories.keys()):
    creators = categories[category]
    samples = random.sample(creators, min(10, len(creators)))

    print(f'\n\n{"=" * 80}')
    print(f'{category.upper()} ({len(creators)} total)')
    print('=' * 80)

    for i, creator in enumerate(samples, 1):
        print(f'\n{i}. @{creator["username"]} - {creator["display_name"]}')
        print(f'   Bio: {creator["bio"][:150]}...' if len(creator["bio"]) > 150 else f'   Bio: {creator["bio"]}')
        print(f'   Followers: {creator["follower_count"]:,}')
        print(f'   Earnings: ${float(creator["earnings_usd"]):,.2f}')
        print(f'   Confidence: {creator["confidence"]}')
        print(f'   Reasoning: {creator["reasoning"][:200]}...' if len(creator["reasoning"]) > 200 else f'   Reasoning: {creator["reasoning"]}')
        if creator.get('secondary_traits'):
            print(f'   Secondary: {", ".join(creator["secondary_traits"])}')

print('\n')
