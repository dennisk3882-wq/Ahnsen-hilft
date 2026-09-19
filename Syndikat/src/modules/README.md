# Syndikat runtime modules

These files are the canonical production modules. Since v5.6, modules are named by domain rather than historical patch/version numbers.

Legacy save migration code remains inside `10-compatibility-core.js` intentionally so older saves continue to load. Cross-system access should use exported system APIs and `window.SyndikatRuntime`; modules must not reach into another module's private closure.

The generated `Syndikat/js/core.js` must always equal the deterministic output of `Syndikat/tools/build-core.cjs`.
