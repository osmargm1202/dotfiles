# NEC data access note

Shared source policy for NEC agents.

## Local-first cache
- Root: `~/.pi/assets/nec/2023/`
- Use local file if present.
- If local missing, fetch same relative path from `https://r2.or-gm.com/nec/`.
- Save fetched file locally, then use local path.

## Preload files
- `index.json`
- `metadata.json`
- `chunks-manifest.json`

## Chunk fetch
Fetch only needed `chunks/refined-*.json` files after routing.

## Canonical dataset
Treat `chunks-manifest.json` and `refined-*.json` as source of truth.
Ignore legacy `chunk-*.json` files.

## Final user response
Only `ingeniero-orgm` answers end user.
Experts return machine-friendly evidence to orchestrator.
End-user response should be normal prose, not JSON, unless explicitly requested.
