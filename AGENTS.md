# Facefilter development guide

- Runtime source and public exports live in `package/src` and `package/index.ts`.
- Preserve application scene settings. The sample ring demo is opt-in through `?ring`.
- Use one component implementation per registered type. Do not mix stale `lib` output with `src` in `codegen/register_types.ts`; Unity scans local npm definitions recursively.
- Local Unity npm definitions must use `allowCodegen: false`; the installed Unity package supplies its C# wrappers.
- Runtime registration, public API exports, and Unity components must refer to compatible types. Preserve existing Unity script GUIDs when renaming components.
- Hand coordinate, camera ownership, measurement, and cleanup contracts are documented in `package/README.md` under Hand attachment integration reference.
- Autofit is optional. Measure a loaded rigid ring opening once; use only the attached finger segment's skin to fit it. Unsupported assets need an explicit radius, not a bounding-box guess.
- Run `npm test` in `package` (Vitest). Use `npm run test:watch` for iteration and `npm test -- <file-or-name>` to narrow files.
- Runtime regressions use production code with browser/ML host services stubbed. Keep Unity/rendering limitations explicit.
- Run `npm run test:release` for package/Unity metadata, TypeScript, bundling, and tarball checks. It never publishes.
- Unit tests, fixtures, and Vitest configuration are development-only; keep them out of published files.
- The sample web project is `Unity FaceFilter Example/Needle/WebProject`. Base URL must preserve exported face-filter settings.
