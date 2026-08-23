# Trade rules

`config/trade-rules.json` is loaded at boot. Values are **placeholders** (`verified: false`). Confirm against the current Pokémon TCG Pocket client before trusting eligibility or currency costs.

## You need to verify

- Which rarities can be traded
- Same-rarity matching
- Per-set blocks
- Trade token / shinedust cost by rarity
- Friendship requirement before a trade

Do not hardcode those numbers in router or listing code — change the JSON (or a future admin editor).
