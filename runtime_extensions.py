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

    if not getattr(app.state, "current_events_center_installed", False):
        from current_events_patch import router as current_events_router
        # Merges the old Veranstaltungen and Aktuelles destinations while
        # keeping legacy URLs compatible.
        _prepend_router(app, current_events_router)
        app.state.current_events_center_installed = True

    if not getattr(app.state, "current_events_mobile_installed", False):
        from current_events_mobile_patch import router as current_events_mobile_router
        # Final mobile-first public layer. It only overrides the center index
        # and bottom-nav JavaScript; detail, reminder and ICS routes stay on
        # the established current_events_patch implementation.
        _prepend_router(app, current_events_mobile_router)
        app.state.current_events_mobile_installed = True

    if not getattr(app.state, "current_events_content_polish_installed", False):
        # This import normalizes legacy hour-only values (e.g. "17") for both
        # detail rendering and ICS. Its route only polishes the detail title.
        from current_events_content_polish import router as current_events_content_router
        _prepend_router(app, current_events_content_router)
        app.state.current_events_content_polish_installed = True

    if not getattr(app.state, "current_events_final_polish_installed", False):
        # Server-side normalization protects all admin writes, while the final
        # display layer removes the duplicate archive card, adds the filter
        # fade, reserves enough bottom-nav space and installs the native time
        # picker in the existing administration page.
        import event_storage_polish  # noqa: F401
        import current_events_final_polish  # noqa: F401
        app.state.current_events_final_polish_installed = True

    if not getattr(app.state, "event_detail_redesign_installed", False):
        # Final event-detail route: upcoming appointments focus on the key
        # facts/actions; past appointments become recap pages with a gallery.
        from event_detail_redesign import router as event_detail_router
        _prepend_router(app, event_detail_router)
        app.state.event_detail_redesign_installed = True
