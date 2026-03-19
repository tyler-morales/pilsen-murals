"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Image from "next/image";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

export type ZoomableImageHandle = {
  resetTransform: (animationTime?: number) => void;
};

type ZoomableImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  isLoaded?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  onZoomChange?: (isZoomed: boolean) => void;
  resetKey?: string | number;
  onClick?: (e: React.MouseEvent) => void;
};

export const ZoomableImage = forwardRef<ZoomableImageHandle, ZoomableImageProps>(function ZoomableImage(
  {
    src,
    alt,
    fill = true,
    sizes,
    className = "",
    isLoaded = true,
    onLoad,
    onError,
    onZoomChange,
    resetKey,
    onClick,
  },
  ref
) {
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);

  useImperativeHandle(ref, () => ({
    resetTransform(animationTime = 0.2) {
      transformRef.current?.resetTransform(animationTime);
    },
  }));

  useEffect(() => {
    if (resetKey !== undefined && transformRef.current) {
      transformRef.current.resetTransform(0.2);
    }
  }, [resetKey]);

  return (
    <TransformWrapper
      ref={(r) => {
        transformRef.current = r;
      }}
      initialScale={1}
      minScale={1}
      maxScale={4}
      centerOnInit
      limitToBounds
      doubleClick={{
        mode: "toggle",
        step: 2.5,
        animationTime: 0.2,
      }}
      wheel={{
        step: 0.1,
      }}
      onTransformed={(_, state) => {
        onZoomChange?.(state.scale > 1);
      }}
      onInit={(ref) => {
        onZoomChange?.(ref.state.scale > 1);
      }}
    >
      <TransformComponent
        wrapperClass="!w-full !h-full"
        contentClass="!w-full !h-full flex items-center justify-center"
      >
        <div className="relative h-full w-full" onClick={onClick}>
          <Image
            src={src}
            alt={alt}
            fill={fill}
            sizes={sizes}
            className={`object-contain transition-opacity duration-300 ease-out ${isLoaded ? "opacity-100" : "opacity-0"} ${className}`}
            onLoad={onLoad}
            onError={onError}
            draggable={false}
            unoptimized={false}
          />
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
});
