/* ==========================================================================
   layout.js — page geometry, in millimetres
   --------------------------------------------------------------------------
   The single source of truth for where things land on paper. Both consumers
   use these exact numbers:

     · the on-screen preview, which positions each image absolutely in mm
     · the PDF export, which passes them straight to jsPDF.addImage

   Keeping one implementation is the point. Two copies of this arithmetic —
   one for the screen, one for the document — drift the moment either is
   touched, and the drift only shows up on paper.
   ========================================================================== */

export const PAPER = { A4: [210, 297] };    // add A3: [297, 420] here when wanted

export function pageMM(settings){
  const [w, h] = PAPER[settings.paper] || PAPER.A4;
  return settings.orientation === 'landscape' ? [h, w] : [w, h];
}

/* The margin is one inset around the whole block of cells, not a gutter
   around each — matching how this tool has always laid a page out. */
export function cellRects(settings){
  const [pw, ph] = pageMM(settings);
  const m = settings.margin;
  const cw = (pw - m * 2) / settings.cols;
  const ch = (ph - m * 2) / settings.rows;

  const rects = [];
  for (let r = 0; r < settings.rows; r++){
    for (let c = 0; c < settings.cols; c++){
      rects.push({ x: m + c * cw, y: m + r * ch, w: cw, h: ch });
    }
  }
  return rects;
}

/* Fit an image whole inside a cell — never cropped, aspect preserved.
   Horizontally always centred; vertically centred or top, per the setting. */
export function fitRect(imgW, imgH, cell, alignTop){
  const imgRatio  = imgW / imgH;
  const cellRatio = cell.w / cell.h;

  let w, h;
  if (imgRatio > cellRatio){ w = cell.w; h = cell.w / imgRatio; }
  else                     { h = cell.h; w = cell.h * imgRatio; }

  return {
    x: cell.x + (cell.w - w) / 2,
    y: cell.y + (alignTop ? 0 : (cell.h - h) / 2),
    w, h
  };
}

/* Every image placed on every page, in order — the whole document described
   as plain data. The preview draws these rects and the PDF writes them, so
   pagination has one implementation and can be tested without a browser. */
export function placements(images, settings){
  const rects    = cellRects(settings);
  const perPage  = rects.length;
  const alignTop = settings.align === 'top';

  return images.map((img, i) => ({
    page: Math.floor(i / perPage),
    cell: i % perPage,
    img,
    rect: fitRect(img.w, img.h, rects[i % perPage], alignTop)
  }));
}

export function pageCount(images, settings){
  return Math.max(1, Math.ceil(images.length / (settings.cols * settings.rows)));
}

/* jsPDF wants the format named. The old build hardcoded 'JPEG' for every
   image, which silently re-encoded PNGs and flattened their transparency. */
export function formatOf(dataURL){
  const m = /^data:image\/([a-z+]+)/i.exec(dataURL || '');
  const type = (m ? m[1] : 'jpeg').toLowerCase();
  if (type === 'jpg') return 'JPEG';
  if (type === 'svg+xml') return 'PNG';     // rasterised before it gets here
  return type.toUpperCase();                // PNG, JPEG, WEBP, GIF, BMP
}
