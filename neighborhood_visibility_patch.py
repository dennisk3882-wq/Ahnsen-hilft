from __future__ import annotations

import neighborhood_enhanced_patch as enhanced


if not getattr(enhanced, "_visibility_cleanup_installed", False):
    _original_home_html = enhanced._home_html

    def _home_html_without_duplicate_actions(*args, **kwargs):
        response = _original_home_html(*args, **kwargs)
        html = response.body.decode("utf-8")
        for snippet in (
            '<a class="nhv2-btn primary" href="#beitrag">Hilfe suchen</a>',
            '<a class="nhv2-btn" href="#beitrag">Hilfe anbieten</a>',
            '<a class="nhv2-btn" href="/nachrichten">💬 Meine Nachrichten</a>',
        ):
            html = html.replace(snippet, "")
        response.body = html.encode("utf-8")
        response.headers["content-length"] = str(len(response.body))
        return response

    enhanced._home_html = _home_html_without_duplicate_actions
    enhanced._visibility_cleanup_installed = True
