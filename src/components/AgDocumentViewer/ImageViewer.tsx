import React from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type Props = {
  url: string;
  fileName: string;
};

export const ImageViewer: React.FC<Props> = ({ url, fileName }) => (
  <div
    className="ag-image-viewer relative h-full min-h-0 w-full bg-[#1c1c1e]"
    data-ag-no-swipe-back
  >
    <TransformWrapper
      minScale={0.35}
      maxScale={8}
      centerOnInit
      doubleClick={{ mode: "toggle", step: 1.35 }}
      pinch={{ step: 6 }}
      wheel={{ step: 0.12 }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%" }}
          >
            <img
              src={url}
              alt={fileName}
              draggable={false}
              className="max-h-full max-w-full object-contain select-none"
            />
          </TransformComponent>
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/70 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm">
              <button
                type="button"
                onClick={() => zoomOut()}
                className="rounded-full p-2 hover:bg-white/15"
                title="Alejar"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={() => resetTransform()}
                className="rounded-full p-2 hover:bg-white/15"
                title="Ajustar"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => zoomIn()}
                className="rounded-full p-2 hover:bg-white/15"
                title="Acercar"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </TransformWrapper>
  </div>
);
