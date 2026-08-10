from __future__ import annotations


def _install_routes_first(app, routes) -> None:
    """Insert fully configured APIRoutes before legacy compatibility routes."""
    for route in reversed(list(routes)):
        app.router.routes.insert(0, route)


def install_runtime_extensions() -> None:
    """Install production route overrides without changing Render's entrypoint.

    Render keeps using ``uvicorn pwa_main:app``. Each extension has its own
    idempotent state flag so a previously installed feature never prevents a
    newer extension from being registered.
    """
    from pwa_core import app

    if not getattr(app.state, "citizen_mobility_installed", False):
        # Compact route planner stays the visible citizen experience. The final
        # trip-buttons patch adds a clear stop-list action to every transit leg.
        from mobility_trip_buttons_patch import router as citizen_mobility_router

        _install_routes_first(app, citizen_mobility_router.routes)
        app.state.citizen_mobility_installed = True

    if not getattr(app.state, "neighbor_v2_installed", False):
        from neighbor_v2_routes import install_neighbor_v2, router as neighbor_v2_router

        install_neighbor_v2()
        _install_routes_first(app, neighbor_v2_router.routes)
        app.state.neighbor_v2_installed = True
