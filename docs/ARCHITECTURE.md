# Nya Accounting Architecture

Nya Accounting is a local-first personal spending tracker. It records spending
and calculates budget status; it does not reconcile wallet balances or track
investment values.

## Product boundaries

- Payment channels and funding instruments are transaction metadata, not
  balance-bearing accounts.
- Investments, repayments, transfers, top-ups, failed payments, and pending
  payments do not count toward spending.
- AI always creates a draft. A user confirms the critical fields before a
  transaction affects the budget.
- Raw screenshots stay transient. Confirmed records contain only
  structured data and an optional source fingerprint.

## Runtime layers

- `src/domain`: Types, transaction normalization, budget calculations, and
  analytics. This layer has no React Native dependencies.
- `src/services`: AI, secure credentials, persistence, import/export, and
  platform adapters.
- `src/store`: React context that owns local state and persistence.
- `src/components`: Reusable controls and charts.
- `src/screens`: Home, records, capture, statistics, and settings workflows.

## AI request path

1. A screenshot is selected and resized locally.
2. Optional text is combined with the screenshot.
3. A user-configured OpenAI-compatible multimodal endpoint returns structured
   JSON with evidence and review flags.
4. The response is normalized into a transaction draft.
5. The user confirms or edits the draft before saving.

## Recurring expense path

1. A recurring expense stores a schedule and amount, but does not create
   transactions automatically.
2. Active, unposted occurrences can be reserved from the monthly budget.
3. A captured transaction is linked automatically only when currency, amount,
   and merchant identity produce one unambiguous local match.
4. The user can change or remove that link during review. A confirmed linked
   expense counts as the posted occurrence, so it is not reserved twice.

The API key is stored in SecureStore on Android/iOS. Web development uses local
storage and displays a warning because browser storage cannot offer equivalent
protection.
