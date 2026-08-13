from __future__ import annotations


def _prepend_router(app, router) -> None:
    for route in reversed(list(router.routes)):
        app.router.routes.insert(0, route)


def _reposition_router_first(app, router) -> None:
    """Keep one router's exact route objects at the very front.

    Some production bootstrap paths install runtime extensions more than once.
    Repositioning the final homepage router makes its precedence deterministic
    without accumulating duplicate copies of the same APIRoute objects.
    """
    owned = list(router.routes)
    app.router.routes[:] = [route for route in app.router.routes if route not in owned]
    _prepend_router(app, router)


def install_runtime_extensions() -> None:
    """Install production route overrides on the established pwa_main app."""
    from pwa_core import app

    if not getattr(app.state, "citizen_mobility_installed", False):
        from mobility_trip_buttons_patch import router as citizen_mobility_router
        _prepend_router(app, citizen_mobility_router)
        app.state.citizen_mobility_installed = True

    if not getattr(app.state, "neighborhood_platform_installed", False):
        import neighborhood_mobile_patch  # noqa: F401
        from neighborhood_routes import router as neighborhood_router
        from neighborhood_messages_patch import router as neighborhood_messages_router
        _prepend_router(app, neighborhood_router)
        _prepend_router(app, neighborhood_messages_router)
        app.state.neighborhood_platform_installed = True

    if not getattr(app.state, "neighborhood_enhancements_installed", False):
        from neighborhood_enhanced_patch import router as neighborhood_enhanced_router
        import neighborhood_visibility_patch  # noqa: F401
        _prepend_router(app, neighborhood_enhanced_router)
        app.state.neighborhood_enhancements_installed = True

    if not getattr(app.state, "current_events_center_installed", False):
        from current_events_patch import router as current_events_router
        _prepend_router(app, current_events_router)
        app.state.current_events_center_installed = True

    if not getattr(app.state, "current_events_mobile_installed", False):
        from current_events_mobile_patch import router as current_events_mobile_router
        _prepend_router(app, current_events_mobile_router)
        app.state.current_events_mobile_installed = True

    if not getattr(app.state, "current_events_content_polish_installed", False):
        from current_events_content_polish import router as current_events_content_router
        _prepend_router(app, current_events_content_router)
        app.state.current_events_content_polish_installed = True

    if not getattr(app.state, "current_events_final_polish_installed", False):
        import event_storage_polish  # noqa: F401
        import current_events_final_polish  # noqa: F401
        app.state.current_events_final_polish_installed = True

    if not getattr(app.state, "event_detail_redesign_installed", False):
        from event_detail_redesign import router as event_detail_router
        _prepend_router(app, event_detail_router)
        app.state.event_detail_redesign_installed = True

    if not getattr(app.state, "mangel_duplicate_workflow_installed", False):
        from mangel_duplicate_patch import router as mangel_duplicate_router
        _prepend_router(app, mangel_duplicate_router)
        app.state.mangel_duplicate_workflow_installed = True

    if not getattr(app.state, "citizen_service_center_installed", False):
        from citizen_service_center import router as citizen_service_router
        _prepend_router(app, citizen_service_router)
        app.state.citizen_service_center_installed = True

    if not getattr(app.state, "pwa_exact_photo_icon_installed", False):
        # v7 uses the exact Ahnsen stone artwork supplied by the project owner.
        # A fresh URL also forces Android/desktop installers off the cached v6 icon.
        from pwa_icon_photo_patch import router as pwa_photo_icon_router
        _prepend_router(app, pwa_photo_icon_router)
        app.state.pwa_exact_photo_icon_installed = True

    # These homepage layers are intentionally re-positioned on every call.
    from home_weather_center import router as home_weather_router
    _reposition_router_first(app, home_weather_router)
    app.state.home_weather_dashboard_installed = True

    from home_dashboard_final_polish import router as home_final_router
    _reposition_router_first(app, home_final_router)
    app.state.home_dashboard_final_polish_installed = True

    from home_hero_inline_patch import router as home_inline_router
    _reposition_router_first(app, home_inline_router)
    app.state.home_hero_inline_installed = True
