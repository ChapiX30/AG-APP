# -*- coding: utf-8 -*-
"""Aplica lock_all_masters_calidad solo a Formato Angle meter.xlsm."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lock_all_masters_calidad as lock

lock.MASTERS = [m for m in lock.MASTERS if "Angle" in m["file"]]
if not lock.MASTERS:
    raise SystemExit("No está registrado Formato Angle meter.xlsm en lock_all_masters_calidad")
raise SystemExit(lock.main())
