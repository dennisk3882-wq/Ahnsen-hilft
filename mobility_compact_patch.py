from __future__ import annotations

import mobility_citizen as legacy
import mobility_journey_patch as journey


router = journey.router
_original_content = journey.content

_COMPACT_STYLE = r'''
<style>
/* Die Verbindungssuche ist die primäre Bürgeransicht. Die frühere technische
   Abfahrtstafel bleibt im DOM als interner Daten-/Kompatibilitätslayer, wird
   aber nicht mehr sichtbar dargestellt. */
.mob-citizen .cit-board,
.mob-citizen .cit-day,
.mob-citizen .cit-map-details,
.mob-citizen .cit-lines {
  display: none !important;
}
.mob-citizen .journey-card {
  margin-bottom: 22px;
}
.mob-citizen .app-main {
  padding-bottom: 190px;
}
</style>
'''


def content() -> str:
    return _COMPACT_STYLE + _original_content()


legacy._content = content
