# Localization

Context Canvas keeps interface copy in JSON catalogs so translators can review and contribute without editing React components.

## Files

- `src/locales/en.json` is the source catalog and fallback language.
- `src/locales/zh-CN.json` is the Simplified Chinese catalog.
- `src/i18n.tsx` provides the typed locale context and interpolation helper.

## Adding A Locale

1. Copy `src/locales/en.json` to a new locale file, such as `ja.json`.
2. Keep the message keys unchanged and translate only the values.
3. Add the locale to the `Locale` union and `messages` map in `src/i18n.tsx`.
4. Add the language to the Settings selector in `src/App.tsx`.
5. Run `pnpm run build` and `pnpm run test:codex-import`.

## Translation Rules

- Keep product and format names such as `Context Canvas`, `Codex`, `Complex Chat`, `Markdown`, `JSON`, and `Turn` recognizable unless a local convention is clearly better.
- Preserve interpolation tokens such as `{{count}}`, `{{file}}`, `{{detail}}`, and `{{color}}` exactly.
- Prefer complete messages over concatenating translated fragments in components.
- Add new user-facing copy to both catalogs before using it in the UI.
- Keep parser diagnostics and import errors localized too; they are part of the user-facing workflow.

The app defaults to English and stores the selected locale in localStorage under `context-canvas.locale.v1`.
