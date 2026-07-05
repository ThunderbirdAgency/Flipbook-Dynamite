declare module "page-flip" {
  export type SizeType = "fixed" | "stretch";

  export interface FlipSetting {
    width: number;
    height: number;
    size?: SizeType;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    startPage?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    swipeDistance?: number;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  }

  export interface FlipEvent {
    data: number | string;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: Partial<FlipSetting> & { width: number; height: number });
    loadFromHTML(items: NodeListOf<Element> | Element[]): void;
    loadFromImages(images: string[]): void;
    updateFromHtml(items: NodeListOf<Element> | Element[]): void;
    destroy(): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    flip(page: number, corner?: "top" | "bottom"): void;
    turnToPage(page: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    getOrientation(): "portrait" | "landscape";
    on(event: "flip" | "changeOrientation" | "changeState" | "init" | "update", callback: (e: FlipEvent) => void): void;
    off(event: string): void;
  }
}
