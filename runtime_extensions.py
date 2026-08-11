from __future__ import annotations


def _prepend_router(app, router) -> None:
    for route in reversed(list(router.routes)):
        app.router.routes.insert(0, route)


def install_runtime_extensions() -> None:
    """Install production route overrides on the established pwa_main app."""
    from pwa_core import app

    if not getattr(app.state, "citizen_mobility_installed", False):
        from mobility_trip_buttons_patch import router as citizen_mobility_router
        _prepend_router(app, citizen_mobility_router)
        app.state.citizen_mobility_installed = True

    if not getattr(app.state, "neighborhood_platform_installed", False):
        # Apply the mobile/UI monkey patch before neighborhood_routes imports
        # neighborhood_page by name.
        import neighborhood_mobile_patch  # noqa: F401
        from neighborhood_routes import router as neighborhood_router
        from neighborhood_messages_patch import router as neighborhood_messages_router

        _prepend_router(app, neighborhood_router)
        # This tiny router only overrides the chat GET route so opening a chat
        # also clears its unread central-inbox notifications.
        _prepend_router(app, neighborhood_messages_router)
        app.state.neighborhood_platform_installed = True

    if not getattr(app.state, "neighborhood_enhancements_installed", False):
        from neighborhood_enhanced_patch import router as neighborhood_enhanced_router
        # The enhanced UI is the final citizen route. Clean up duplicate hero
        # actions after importing it, while keeping the central inbox itself.
        import neighborhood_visibility_patch  # noqa: F401
        _prepend_router(app, neighborhood_enhanced_router)
        app.state.neighborhood_enhancements_installed = True
