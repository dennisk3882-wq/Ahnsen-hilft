from pwa_main_base import *  # noqa: F401,F403
from pwa_main_base import app

from mobility_routes import install_mobility


install_mobility(app)
