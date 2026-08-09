from __future__ import annotations

from pwa_main import app
from waste_center import router as _waste_router


# pwa_core already contains the legacy /muelltermine-info route. FastAPI uses
# the first matching route, therefore the modern waste-center routes are
# inserted before the existing route stack without changing any other module.
for _route in reversed(list(_waste_router.routes)):
    app.router.routes.insert(0, _route)

app.state.waste_center_installed = True
