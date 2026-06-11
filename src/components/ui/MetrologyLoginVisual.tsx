import React, { memo } from "react";
import type { MetrologyScene } from "../../utils/loginScenes";
import { DigitalMultimeterLoader } from "./DigitalMultimeterLoader";
import { DimensionalCalibrationLoader } from "./DimensionalCalibrationLoader";
import { TorqueCalibrationLoader } from "./TorqueCalibrationLoader";
import type { LoginLoaderProps } from "./loginLoadShared";

interface MetrologyLoginVisualProps extends LoginLoaderProps {
  scene: MetrologyScene;
}

export const MetrologyLoginVisual = memo<MetrologyLoginVisualProps>(function MetrologyLoginVisual({
  scene,
  ...loaderProps
}) {
  switch (scene) {
    case "dimensional":
      return <DimensionalCalibrationLoader {...loaderProps} />;
    case "torque":
      return <TorqueCalibrationLoader {...loaderProps} />;
    case "electrical":
    default:
      return <DigitalMultimeterLoader {...loaderProps} />;
  }
});
