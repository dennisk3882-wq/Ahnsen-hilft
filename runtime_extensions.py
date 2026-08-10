from __future__ import annotations


def install_runtime_extensions() -> None:
    """Install public route overrides after pwa_main finished registering routes.

    Render keeps using the established ``uvicorn pwa_main:app`` entrypoint. This
    hook runs during FastAPI startup, so route overrides inserted here are in
    front of older compatibility routes without introducing a second app entry.
    """
    from pwa_core import app

    if getattr(app.state, "citizen_mobility_installed", False):
        return

    # Journey patch imports the robust Transitous/EFA data layer first and then
    # adds route planning, nearest-stop detection and clickable trip details.
    from mobility_journey_patch import router as citizen_mobility_router

    for route in reversed(list(citizen_mobility_router.routes)):
        app.router.routes.insert(0, route)

    app.state.citizen_mobility_installed = True
