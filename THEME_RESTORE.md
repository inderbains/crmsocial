# RealVolt 0.8.1 — Original theme restored

Upload the complete source and rebuild with `npm run build`, output directory `out`. This update needs no new SQL migration. Existing theme customisation still needs migration 014 installed; do not rerun it if already installed.

The original RealVolt palette is the default for accounts/brokerages without a saved custom theme:
- Dark green primary buttons: #193E32
- Orange logo and application icons: #DA2C00
- Warm cream workspace background: #F6F7F2
- Light sage dates card and selected navigation: #E7EDDF

Existing saved brokerage colours are retained. To restore your office to the original look after deployment, open Back Office → Brokerage settings → Restore original RealVolt theme → Save brokerage theme. Members receive the theme on refresh or returning to their tab.

The dates card was previously an ordinary white panel and was not connected to the theme. It now has its own themed surface: the original palette gives it light sage; changing the primary colour gives it a matching pale tint. Logo and application icons now use Accent rather than Primary. Button colours remain connected to Primary.

Each colour also has a HEX text field, so you can paste values directly without converting to RGB in the browser's native colour picker. Invalid HEX entries cannot be saved. Artwork, uploaded PDFs and printed cheques keep their existing colours.

TypeScript and the production static build were checked for this change. Existing Back Office, agent setup, cheque printing and SignVolt features are included.
