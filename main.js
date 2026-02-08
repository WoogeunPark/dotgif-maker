import { GIFEncoder, quantize, applyPalette } from 'https://unpkg.com/gifenc';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('dotCanvas');
  const ctx = canvas.getContext('2d');
  const colorPicker = document.getElementById('colorPicker');
  const addFrameBtn = document.getElementById('addFrame');
  const deleteFrameBtn = document.getElementById('deleteFrame');
  const prevFrameBtn = document.getElementById('prevFrame');
  const nextFrameBtn = document.getElementById('nextFrame');
  const frameIndicator = document.getElementById('frameIndicator');
  const exportGifBtn = document.getElementById('exportGif');
  const previewGifBtn = document.getElementById('previewGif');
  const gifPreview = document.getElementById('gifPreview');
  const canvasSizeSelect = document.getElementById('canvasSizeSelect');
  const customWidthInput = document.getElementById('customWidth');
  const customHeightInput = document.getElementById('customHeight');
  const penToolBtn = document.getElementById('penTool');
  const eraserToolBtn = document.getElementById('eraserTool');
  const eyedropperToolBtn = document.getElementById('eyedropperTool');
  const recentColorsContainer = document.getElementById('recentColorsContainer');
  const penColorPreview = document.getElementById('penColorPreview');
  const clearFrameBtn = document.getElementById('clearFrame');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const penThicknessOptions = document.getElementById('penThicknessOptions');
  const eraserThicknessOptions = document.getElementById('eraserThicknessOptions');
  const colorModeToggle = document.getElementById('colorModeToggle');
  const colorSelectionContainer = document.querySelector('.color-selection');
  const colorPalette = document.querySelector('.color-palette');
  const selectToolBtn = document.getElementById('selectTool');
  const copyBtn = document.getElementById('copyBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  let paletteColors;
  let recentColors = [];

  const PIXEL_SIZE = 10;
  let COLS = canvas.width / PIXEL_SIZE;
  let ROWS = canvas.height / PIXEL_SIZE;
  const BACKGROUND_COLOR = 'transparent';

  let currentColor = colorPicker.value;
  let isDrawing = false;
  let currentGridOpacity = 0.4; // Default opacity
  let frames = [];
  let history = [];
  let historyIndex = [];
  let currentFrameIndex = 0;
  let currentTool = 'pen';
  let currentPenThickness = 1;
  let currentEraserThickness = 1;

  // Lasso Selection State
  let selectionPath = []; // Array of {r, c}
  let isSelectionClosed = false;
  let currentMouseVertex = null;

  let clipboard = null; // Array of {rOffset, cOffset, color}
  let isPasting = false;
  let pastePreviewPos = null;

  // Helper: Point in Polygon (Ray Casting)
  function isPixelInPolygon(r, c, path) {
    const x = c + 0.5;
    const y = r + 0.5;
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const xi = path[i].c, yi = path[i].r;
      const xj = path[j].c, yj = path[j].r;

      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Zoom & Pan State
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 10.0; // Increased max zoom for pixel art
  const ZOOM_STEP = 0.1;

  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
  const canvasWrapper = document.querySelector('.canvas-wrapper');

  function updateTransform() {
    zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + '%';
    // Use translate + scale to handle pan and zoom
    // Ensure transform-origin is center (default in CSS) or 0 0 if we managed pan manually?
    // We will rely on CSS transform-origin: center center; and calculate pan offset from center.
    canvasWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;

    // Optional: Update margin/layout if needed, but translate is usually sufficient for visual zoom
  }

  function handleZoom(delta, clientX, clientY) {
    const oldZoom = zoomLevel;
    let newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));

    if (newZoom === oldZoom) return;

    // Calculate mouse position relative to the center of the viewport/wrapper
    // This allows us to zoom towards the mouse cursor
    if (clientX !== undefined && clientY !== undefined) {
      const rect = canvasWrapper.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Mouse offset from center, in *current* scale units
      // We want this offset to stay constant relative to the screen, 
      // implying the 'world' point moves away/towards center.
      // Correction: We need to adjust panX/panY.

      // Formula: 
      // The point under cursor in "world space" (relative to center, unscaled) is:
      // worldX = (clientX - centerX) / oldZoom
      // worldY = (clientY - centerY) / oldZoom

      // After zoom, we want that same world point to be at clientX, clientY.
      // newCenterX + worldX * newZoom = clientX
      // (rect.left + width/2) is the *visual* center including pan? 
      // No, rect includes transform.

      // Let's us basic principle: 
      // Shift pan to compensate for the Zoom step towards mouse.
      // Offset from center:
      const offsetX = clientX - centerX;
      const offsetY = clientY - centerY;

      // We want to move the image so that the point under cursor remains.
      // Change in scale causes a shift of position = offset * (change ratio)?
      // panX -= (mouseX in local) * (scaleDiff)

      // Let's try:
      // panX -= (offsetX / oldZoom) * (newZoom - oldZoom);
      // panY -= (offsetY / oldZoom) * (newZoom - oldZoom);

      // Wait, rect.center IS the center of the Transformed element. 
      // If we use wrapper.parentElement center (viewport center):
      const containerRect = canvasWrapper.parentElement.getBoundingClientRect();
      const viewCenterX = containerRect.left + containerRect.width / 2;
      const viewCenterY = containerRect.top + containerRect.height / 2;

      const mouseXFromCenter = clientX - viewCenterX - panX; // Mouse pos relative to current panned center
      const mouseYFromCenter = clientY - viewCenterY - panY;

      // Logic:
      // The pixel under mouse is at `mouseXFromCenter / oldZoom`.
      // We want it to be at `mouseXFromCenter / newZoom` ? No.
      // We want the new panX such that:
      // (PixelWorldX * newZoom) + newPanX = ClientOffsetFromViewCenter

      // PixelWorldX = (clientX - (viewCenterX + panX)) / oldZoom
      // ClientOffset = clientX - viewCenterX

      // ( (clientX - viewCenterX - panX) / oldZoom ) * newZoom + newPanX = clientX - viewCenterX
      // Let K = (clientX - viewCenterX)
      // ( (K - panX) / oldZoom ) * newZoom + newPanX = K
      // (K - panX) * (newZoom/oldZoom) = K - newPanX
      // newPanX = K - (K - panX) * (newZoom/oldZoom)

      const Kx = clientX - viewCenterX;
      const Ky = clientY - viewCenterY;
      const scaleRatio = newZoom / oldZoom;

      panX = Kx - (Kx - panX) * scaleRatio;
      panY = Ky - (Ky - panY) * scaleRatio;
    }

    zoomLevel = newZoom;
    updateTransform();
  }

  // Wheel Zoom Listener
  canvasWrapper.parentElement.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey || true) { // Always zoom on wheel inside canvas area? User asked for magnifying glass.
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      handleZoom(delta, e.clientX, e.clientY);
    }
  }, { passive: false });

  zoomInBtn.addEventListener('click', () => handleZoom(ZOOM_STEP)); // Center zoom if no coords
  zoomOutBtn.addEventListener('click', () => handleZoom(-ZOOM_STEP));
  zoomResetBtn.addEventListener('click', () => {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    updateTransform();
  });


  // --- History Management ---
  function saveState() {
    const frameHistory = history[currentFrameIndex];
    const currentIndex = historyIndex[currentFrameIndex];
    if (currentIndex < frameHistory.length - 1) {
      history[currentFrameIndex] = frameHistory.slice(0, currentIndex + 1);
    }
    history[currentFrameIndex].push(JSON.parse(JSON.stringify(frames[currentFrameIndex])));
    historyIndex[currentFrameIndex]++;
    updateUndoRedoButtons();
  }

  function undo() {
    if (historyIndex[currentFrameIndex] > 0) {
      historyIndex[currentFrameIndex]--;
      frames[currentFrameIndex] = JSON.parse(JSON.stringify(history[currentFrameIndex][historyIndex[currentFrameIndex]]));
      drawGrid();
      updateUndoRedoButtons();
    }
  }

  function redo() {
    if (historyIndex[currentFrameIndex] < history[currentFrameIndex].length - 1) {
      historyIndex[currentFrameIndex]++;
      frames[currentFrameIndex] = JSON.parse(JSON.stringify(history[currentFrameIndex][historyIndex[currentFrameIndex]]));
      drawGrid();
      updateUndoRedoButtons();
    }
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = historyIndex[currentFrameIndex] <= 0;
    redoBtn.disabled = historyIndex[currentFrameIndex] >= history[currentFrameIndex].length - 1;
  }

  function createGrid(cols, rows) {
    return Array(rows).fill(null).map(() => Array(cols).fill(BACKGROUND_COLOR));
  }

  function drawGrid() {
    console.log('drawGrid called. Clearing canvas.');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentGrid = frames[currentFrameIndex];
    if (!currentGrid) {
      console.log('No current grid to draw.');
      return;
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = currentGrid[r][c];
        ctx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }

    // Draw faint grid
    ctx.strokeStyle = `rgba(0, 0, 0, ${currentGridOpacity})`;
    ctx.lineWidth = 1;

    // Vertical lines
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      // Add 0.5 to center the 1px line on the pixel grid for sharpness
      const x = c * PIXEL_SIZE + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      const y = r * PIXEL_SIZE + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw Lasso Selection
    if (selectionPath.length > 0) {
      ctx.save();
      ctx.beginPath();
      // Move to first vertex (scaled)
      ctx.moveTo(selectionPath[0].c * PIXEL_SIZE, selectionPath[0].r * PIXEL_SIZE);

      // Draw lines to subsequent vertices
      for (let i = 1; i < selectionPath.length; i++) {
        ctx.lineTo(selectionPath[i].c * PIXEL_SIZE, selectionPath[i].r * PIXEL_SIZE);
      }

      // If closed, close path and fill
      if (isSelectionClosed) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'; // Semi-transparent Cyan fill
        ctx.fill();
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // If active (not closed), draw line to current mouse position
        if (currentMouseVertex) {
          ctx.lineTo(currentMouseVertex.c * PIXEL_SIZE, currentMouseVertex.r * PIXEL_SIZE);
        }
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw vertices as small dots for visual feedback
        ctx.fillStyle = 'white';
        selectionPath.forEach(v => {
          ctx.fillRect(v.c * PIXEL_SIZE - 2, v.r * PIXEL_SIZE - 2, 4, 4);
        });
      }
      ctx.restore();
    }

    // Draw Paste Preview
    if (isPasting && clipboard && pastePreviewPos) {
      const startR = pastePreviewPos.r;
      const startC = pastePreviewPos.c;

      ctx.save();
      ctx.globalAlpha = 0.7; // Slightly more opaque for visibility
      clipboard.forEach(pixel => {
        const targetR = startR + pixel.rOffset;
        const targetC = startC + pixel.cOffset;
        if (targetR >= 0 && targetR < ROWS && targetC >= 0 && targetC < COLS) {
          ctx.fillStyle = pixel.color;
          ctx.fillRect(targetC * PIXEL_SIZE, targetR * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
          // Highlight preview border
          ctx.strokeStyle = '#00FF00'; // Neon Green
          ctx.lineWidth = 1;
          ctx.strokeRect(targetC * PIXEL_SIZE, targetR * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      });
      ctx.restore();
    }
  }

  function updateFrameIndicator() {
    if (frameIndicator) {
      frameIndicator.textContent = `${currentFrameIndex + 1} / ${frames.length}`;
    }
    if (history[currentFrameIndex]) {
      updateUndoRedoButtons();
    }
    renderFrameThumbnails(); // Ensure UI stays in sync
  }

  function applyCanvasSize(newWidth, newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    COLS = newWidth / PIXEL_SIZE;
    ROWS = newHeight / PIXEL_SIZE;

    // Fix: Resize and clear grid canvas too
    const gridCanvas = document.getElementById('gridCanvas');
    if (gridCanvas) {
      gridCanvas.width = newWidth;
      gridCanvas.height = newHeight;
      const gCtx = gridCanvas.getContext('2d');
      gCtx.clearRect(0, 0, newWidth, newHeight);
    }

    // Reset Zoom/Pan on resize?
    // panX = 0; panY = 0; zoomLevel = 1.0; updateTransform();

    const initialGrid = createGrid(COLS, ROWS);
    frames = [JSON.parse(JSON.stringify(initialGrid))];
    history = [[JSON.parse(JSON.stringify(initialGrid))]];
    historyIndex = [0];
    currentFrameIndex = 0;
    updateFrameIndicator();
    drawGrid();
  }

  function setActiveToolButton(tool) {
    penToolBtn.classList.remove('active');
    eraserToolBtn.classList.remove('active');
    eyedropperToolBtn.classList.remove('active');

    if (tool === 'pen') penToolBtn.classList.add('active');
    else if (tool === 'eraser') eraserToolBtn.classList.add('active');
    else if (tool === 'eyedropper') eyedropperToolBtn.classList.add('active');

    updateCursor(tool);
  }

  function updateCursor(tool) {
    canvas.classList.remove('pen-cursor', 'eraser-cursor', 'eyedropper-cursor');
    canvas.classList.add(`${tool}-cursor`);
  }

  function addToRecentColors(color) {
    if (!color || color === 'transparent') return;

    // Remove if already exists and add to front
    recentColors = recentColors.filter(c => c.toLowerCase() !== color.toLowerCase());
    recentColors.unshift(color);

    // Limit to 10 colors
    if (recentColors.length > 10) {
      recentColors.pop();
    }

    renderRecentColors();
  }

  function renderRecentColors() {
    recentColorsContainer.innerHTML = '';
    recentColors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'recent-color';
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.addEventListener('click', () => {
        updateCurrentColor(color);
      });
      recentColorsContainer.appendChild(swatch);
    });
  }

  function clearCurrentFrame() {
    frames[currentFrameIndex] = createGrid(COLS, ROWS);
    saveState();
    drawGrid();
  }

  function updateCurrentColor(color) {
    if (!color || color === 'transparent') return;
    currentColor = color;
    colorPicker.value = color;
    penColorPreview.style.backgroundColor = color;
    setActivePaletteColor(color);
  }

  function setActivePaletteColor(selectedColor) {
    if (!paletteColors) {
      paletteColors = document.querySelectorAll('.palette-color');
    }
    paletteColors.forEach(pc => {
      if (pc.dataset.color.toLowerCase() === selectedColor.toLowerCase()) {
        pc.classList.add('active');
      } else {
        pc.classList.remove('active');
      }
    });
  }

  // --- Event Listeners ---
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  colorModeToggle.addEventListener('change', (e) => {
    colorSelectionContainer.dataset.mode = e.target.checked ? 'custom' : 'palette';
    if (e.target.checked) {
      colorPicker.value = currentColor;
    } else {
      setActivePaletteColor(currentColor);
    }
  });

  colorPicker.addEventListener('input', (e) => {
    updateCurrentColor(e.target.value);
  });

  colorPicker.addEventListener('change', (e) => {
    updateCurrentColor(e.target.value);
    currentTool = 'pen';
    setActiveToolButton('pen');
  });

  colorPalette.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('palette-color')) {
      const color = target.dataset.color;
      updateCurrentColor(color);
      colorModeToggle.checked = false;
      colorSelectionContainer.dataset.mode = 'palette';
      currentTool = 'pen';
      setActiveToolButton('pen');
    }
  });

  penThicknessOptions.addEventListener('change', (e) => {
    if (e.target.name === 'penThickness') currentPenThickness = parseInt(e.target.value);
  });

  eraserThicknessOptions.addEventListener('change', (e) => {
    if (e.target.name === 'eraserThickness') currentEraserThickness = parseInt(e.target.value);
  });

  clearFrameBtn.addEventListener('click', clearCurrentFrame);

  canvasSizeSelect.addEventListener('change', (e) => {
    const selectedValue = e.target.value;
    customWidthInput.disabled = selectedValue !== 'custom';
    customHeightInput.disabled = selectedValue !== 'custom';
    if (selectedValue === 'custom') {
      customWidthInput.focus();
    } else {
      const [width, height] = selectedValue.split('x').map(Number);
      const newWidth = width * PIXEL_SIZE;
      const newHeight = height * PIXEL_SIZE;
      customWidthInput.value = newWidth;
      customHeightInput.value = newHeight;
      applyCanvasSize(newWidth, newHeight);
    }
  });

  function handleCustomSizeChange() {
    let newWidth = parseInt(customWidthInput.value);
    let newHeight = parseInt(customHeightInput.value);

    // Enforce 800x800 limit
    if (newWidth > 800) newWidth = 800;
    if (newHeight > 800) newHeight = 800;

    customWidthInput.value = newWidth || 0;
    customHeightInput.value = newHeight || 0;

    if (!isNaN(newWidth) && !isNaN(newHeight) && newWidth > 0 && newHeight > 0) {
      applyCanvasSize(newWidth, newHeight);
    }
  }

  customWidthInput.addEventListener('blur', handleCustomSizeChange);
  customHeightInput.addEventListener('blur', handleCustomSizeChange);
  customWidthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCustomSizeChange(); });
  customHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCustomSizeChange(); });

  penToolBtn.addEventListener('click', () => {
    currentTool = 'pen';
    setActiveToolButton('pen');
  });

  eraserToolBtn.addEventListener('click', () => {
    currentTool = 'eraser';
    setActiveToolButton('eraser');
  });

  eyedropperToolBtn.addEventListener('click', () => {
    currentTool = 'eyedropper';
    setActiveToolButton('eyedropper');
  });

  // --- Image Import Feature ---
  const imageUpload = document.getElementById('imageUpload');
  const importImageBtn = document.getElementById('importImageBtn');

  importImageBtn.addEventListener('click', () => {
    imageUpload.click();
  });

  imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          processImportedImage(img);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  function processImportedImage(img) {
    // Create an off-screen canvas to resize and pixelate the image
    const offCanvas = document.createElement('canvas');
    offCanvas.width = COLS;  // Resize exactly to grid dimensions
    offCanvas.height = ROWS;
    const offCtx = offCanvas.getContext('2d');

    // Draw image stretched to fit grid (simple pixelation)
    // To maintain aspect ratio and crop, we'd need more complex logic.
    // Given "crops to canvas supported size", fitting to dimensions is a good start.
    // For better pixelation, disable smoothing
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(img, 0, 0, COLS, ROWS);

    // Get pixel data
    const imageData = offCtx.getImageData(0, 0, COLS, ROWS);
    const data = imageData.data;

    // Save current state for Undo
    saveState();

    // Map pixels to grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const index = (r * COLS + c) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        // Simple hex conversion
        if (alpha < 128) {
          frames[currentFrameIndex][r][c] = BACKGROUND_COLOR; // Transparent-ish
        } else {
          frames[currentFrameIndex][r][c] = rgbToHex(red, green, blue);
        }
      }
    }

    drawGrid();

    // Reset file input so same file can be selected again
    imageUpload.value = '';
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  // Initialize UI
  setActiveToolButton('pen');

  // Tool Selection
  selectToolBtn.addEventListener('click', () => {
    currentTool = 'select';
    setActiveToolButton('select');
    isPasting = false;
    drawGrid();
  });

  function setActiveToolButton(tool) {
    // Reset states
    penToolBtn.classList.remove('active');
    eraserToolBtn.classList.remove('active');
    eyedropperToolBtn.classList.remove('active');
    selectToolBtn.classList.remove('active');

    // Disable selection if moving away
    if (tool !== 'select') {
      if (tool !== 'pen' || !isPasting) { // Allow switching to pen if pasting
        isPasting = false;
        clipboard = null;
        pasteBtn.disabled = true;
      }
      if (tool !== 'select') {
        selectionPath = [];
        isSelectionClosed = false;
        copyBtn.disabled = true;
      }
      drawGrid();
    }

    if (tool === 'pen') penToolBtn.classList.add('active');
    else if (tool === 'eraser') eraserToolBtn.classList.add('active');
    else if (tool === 'eyedropper') eyedropperToolBtn.classList.add('active');
    else if (tool === 'select') selectToolBtn.classList.add('active');
  }

  copyBtn.addEventListener('click', copySelection);

  pasteBtn.addEventListener('click', () => {
    if (clipboard) {
      isPasting = true;
      currentTool = 'pen'; // Switch to pen logic for placement mostly, or custom
      setActiveToolButton('select');
      document.body.style.cursor = 'crosshair';
    }
  });

  function copySelection() {
    if (!isSelectionClosed || selectionPath.length < 3) {
      alert("Please close the selection loop first.");
      return;
    }

    // Identify pixels inside polygon
    const selectedPixels = [];
    let minR = Infinity, minC = Infinity;
    let maxR = -Infinity, maxC = -Infinity;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isPixelInPolygon(r, c, selectionPath)) {
          if (r < minR) minR = r;
          if (c < minC) minC = c;
          if (r > maxR) maxR = r;
          if (c > maxC) maxC = c;
          selectedPixels.push({ r, c, color: frames[currentFrameIndex][r][c] });
        }
      }
    }

    if (selectedPixels.length === 0) {
      alert("No pixels selected.");
      return;
    }

    const clipboardData = selectedPixels.map(p => ({
      rOffset: p.r - minR,
      cOffset: p.c - minC,
      color: p.color
    }));

    // Create Thumbnail
    const width = maxC - minC + 1;
    const height = maxR - minR + 1;
    const tCanvas = document.createElement('canvas');
    const tSize = 5; // Small pixel size for thumb
    tCanvas.width = width * tSize;
    tCanvas.height = height * tSize;
    const tCtx = tCanvas.getContext('2d');

    selectedPixels.forEach(p => {
      tCtx.fillStyle = p.color;
      tCtx.fillRect((p.c - minC) * tSize, (p.r - minR) * tSize, tSize, tSize);
    });

    // Add to History
    clipboardHistory.unshift({
      id: Date.now(),
      data: clipboardData,
      thumbnail: tCanvas.toDataURL()
    });

    if (clipboardHistory.length > MAX_CLIPBOARD_HISTORY) {
      clipboardHistory.pop();
    }

    // Auto-select new item
    activeClipboardIndex = 0;
    clipboard = clipboardData;
    pasteBtn.disabled = false;

    renderClipboardHistory();
    // alert('Region copied!'); 
  }

  function renderClipboardHistory() {
    if (!clipboardList) return;
    clipboardList.innerHTML = '';
    if (clipboardHistory.length === 0) {
      clipboardList.innerHTML = '<div class="empty-message">No items</div>';
      return;
    }

    clipboardHistory.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `clipboard-item ${index === activeClipboardIndex ? 'active' : ''}`;
      div.innerHTML = `<img src="${item.thumbnail}" />`;
      div.onclick = () => {
        activeClipboardIndex = index;
        clipboard = item.data;
        pasteBtn.disabled = false;
        renderClipboardHistory(); // Update active class

        // Trigger paste mode immediately for convenience
        pasteBtn.click();
      };
      clipboardList.appendChild(div);
    });
  }

  function cancelPaste() {
    if (isPasting) {
      isPasting = false;
      pastePreviewPos = null;
      drawGrid();
      document.body.style.cursor = 'default';
    }
    // Also clear selection if ESC
    if (selectionPath.length > 0) {
      selectionPath = [];
      isSelectionClosed = false;
      copyBtn.disabled = true;
      drawGrid();
    }
  }



  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelPaste();
    }
  });

  // Cancel on background click (simplified)
  document.body.addEventListener('mousedown', (e) => {
    if (!e.target.closest('canvas') && !e.target.closest('.tool-btn') && !e.target.closest('.action-btn')) {
      cancelPaste();
    }
  });

  // Prevent default drag behavior (Avoids ghost image on pan)
  canvas.addEventListener('dragstart', (e) => {
    e.preventDefault();
  });



  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  function getGridCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Relative position in visual pixels
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    // Scale back to internal canvas resolution
    const x = relativeX * scaleX;
    const y = relativeY * scaleY;

    return {
      col: Math.floor(x / PIXEL_SIZE),
      row: Math.floor(y / PIXEL_SIZE)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    // Middle Mouse Button (Pan)
    if (e.button === 1) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      e.preventDefault(); // Prevent default scroll/paste behavior
      canvas.style.cursor = 'grabbing';
      return;
    }

    const { col, row } = getGridCoordinates(e);

    // Pixel coordinates for Drawing/Pasting
    if (isPasting && clipboard) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      saveState();
      // Commit paste (sparse)
      clipboard.forEach(pixel => {
        const targetR = row + pixel.rOffset;
        const targetC = col + pixel.cOffset;
        if (targetR >= 0 && targetR < ROWS && targetC >= 0 && targetC < COLS) {
          frames[currentFrameIndex][targetR][targetC] = pixel.color;
        }
      });
      drawGrid();
      return;
    }

    if (currentTool === 'select') {
      const vR = Math.round(row); // Use integers for grid snapping
      const vC = Math.round(col);

      if (isSelectionClosed) {
        selectionPath = [{ r: vR, c: vC }];
        isSelectionClosed = false;
        copyBtn.disabled = true;
        drawGrid();
        return;
      }

      if (selectionPath.length === 0) {
        selectionPath.push({ r: vR, c: vC });
        drawGrid();
        return;
      }

      const start = selectionPath[0];
      if (start.r === vR && start.c === vC) {
        if (selectionPath.length >= 3) {
          isSelectionClosed = true;
          copyBtn.disabled = false;
        }
      } else {
        selectionPath.push({ r: vR, c: vC });
      }
      drawGrid();
      return;
    }

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

    isDrawing = true;
    if (currentTool !== 'eyedropper') {
      saveState();
      addToRecentColors(currentColor);
    }
    drawPixel(e);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      panX += dx;
      panY += dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
      updateTransform();
      return;
    }

    const { col, row } = getGridCoordinates(e);

    if (isPasting && clipboard) {
      pastePreviewPos = { r: row, c: col };
      drawGrid();
      return;
    }

    if (currentTool === 'select') {
      if (!isSelectionClosed) {
        currentMouseVertex = { r: row, c: col };
        drawGrid();
      }
      return;
    }

    if (isDrawing && currentTool !== 'eyedropper') {
      drawPixel(e);
    }
  });

  // Handle mouseup for panning and drawing
  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = ''; // Revert to default cursor handling
      // Optionally update cursor based on tool
      updateCursor(currentTool);
    }
    isDrawing = false;
  });

  canvas.addEventListener('mouseleave', () => { isDrawing = false; });

  function drawPixel(e) {
    const { col, row } = getGridCoordinates(e);

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

    if (currentTool === 'eyedropper') {
      const pickedColor = frames[currentFrameIndex][row][col];
      // Ensure we don't pick undefined/null if out of bounds (though guard above handles it)
      if (pickedColor) {
        updateCurrentColor(pickedColor);
        currentTool = 'pen';
        setActiveToolButton('pen');
      }
      return;
    }

    const thickness = (currentTool === 'pen') ? currentPenThickness : currentEraserThickness;
    const halfThickness = Math.floor(thickness / 2);

    for (let rOffset = -halfThickness; rOffset <= halfThickness; rOffset++) {
      for (let cOffset = -halfThickness; cOffset <= halfThickness; cOffset++) {
        const targetRow = row + rOffset;
        const targetCol = col + cOffset;
        if (targetRow >= 0 && targetRow < ROWS && targetCol >= 0 && targetCol < COLS) {
          frames[currentFrameIndex][targetRow][targetCol] = (currentTool === 'pen') ? currentColor : BACKGROUND_COLOR;
        }
      }
    }
    drawGrid();
  }





  // --- Frame Thumbnails ---
  function renderFrameThumbnails() {
    const frameList = document.getElementById('frameList');
    if (!frameList) return;
    frameList.innerHTML = '';

    frames.forEach((frameGrid, index) => {
      const frameItem = document.createElement('div');
      frameItem.className = `frame-item ${index === currentFrameIndex ? 'active' : ''}`;
      frameItem.onclick = () => {
        currentFrameIndex = index;
        drawGrid();
        renderFrameThumbnails(); // Update active state
      };

      const frameNum = document.createElement('span');
      frameNum.className = 'frame-number';
      frameNum.textContent = index + 1;

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'frame-thumbnail';
      thumbCanvas.width = COLS;
      thumbCanvas.height = ROWS;
      const thumbCtx = thumbCanvas.getContext('2d');

      // Draw thumbnail
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          thumbCtx.fillStyle = frameGrid[r][c];
          thumbCtx.fillRect(c, r, 1, 1);
        }
      }

      frameItem.appendChild(frameNum);
      frameItem.appendChild(thumbCanvas);
      frameList.appendChild(frameItem);
    });

    // Update count in header
    const frameCountSpan = document.getElementById('frameCount');
    if (frameCountSpan) frameCountSpan.textContent = frames.length;
  }

  // Hook into drawGrid to update thumbnails when drawing changes
  const originalDrawGrid = drawGrid;
  drawGrid = function () {
    originalDrawGrid();
    renderFrameThumbnails();
  };

  // Override internal function reference
  // Note: Since drawGrid was defined as function declaration, we can't easily overwrite it 
  // without changing how it's called or defined. 
  // simpler approach: explicit update in mouseup

  canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    renderFrameThumbnails(); // Update visual on release
  });

  function addFrame() {
    console.log('addFrame called.');
    if (frames.length === 0) {
      // Recovery if empty
      frames.push(createGrid(COLS, ROWS));
      history.push([JSON.parse(JSON.stringify(frames[0]))]);
      historyIndex.push(0);
      currentFrameIndex = 0;
    } else {
      const newGrid = JSON.parse(JSON.stringify(frames[currentFrameIndex]));
      frames.splice(currentFrameIndex + 1, 0, newGrid);
      const newHistory = [JSON.parse(JSON.stringify(newGrid))];
      history.splice(currentFrameIndex + 1, 0, newHistory);
      historyIndex.splice(currentFrameIndex + 1, 0, 0);
      currentFrameIndex++;
    }
    // updateFrameIndicator(); // Removed
    drawGrid();
    saveState();
  }

  addFrameBtn.addEventListener('click', () => {
    console.log('Add Frame button clicked.');
    addFrame();
  });

  deleteFrameBtn.addEventListener('click', () => {
    if (frames.length > 1) {
      frames.splice(currentFrameIndex, 1);
      history.splice(currentFrameIndex, 1);
      historyIndex.splice(currentFrameIndex, 1);
      if (currentFrameIndex >= frames.length) {
        currentFrameIndex = frames.length - 1;
      }
      // updateFrameIndicator(); // Removed
      drawGrid();
    } else {
      alert('Cannot delete the last frame!');
    }
  });

  // Removed Prev/Next Frame Buttons Listeners since they are gone from UI


  const previewOverlay = document.getElementById('gifPreviewOverlay');
  const previewImg = document.getElementById('previewImg');
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const closePreviewBtn = document.getElementById('closePreview');
  const playbackOverlay = document.getElementById('playbackOverlay');
  const previewStage = document.querySelector('.preview-stage');

  let previewInterval = null;
  let previewAnimationFrame = 0;
  let currentSpeed = 1.0;

  async function startPreview() {
    if (frames.length === 0) return;

    stopPreview();
    previewOverlay.classList.add('active');
    playbackOverlay.classList.remove('paused');
    playbackOverlay.classList.add('playing');

    const playEffect = () => {
      renderPreviewFrame(previewAnimationFrame);
      previewAnimationFrame = (previewAnimationFrame + 1) % frames.length;
    };

    const renderPreviewFrame = (idx) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      const frameData = frames[idx];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          tempCtx.fillStyle = frameData[r][c];
          tempCtx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }
      previewImg.src = tempCanvas.toDataURL();
    };

    previewInterval = setInterval(playEffect, 200 / currentSpeed);
  }

  function stopPreview() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
      playbackOverlay.classList.remove('playing');
      playbackOverlay.classList.add('paused');
    }
  }

  function togglePreview() {
    if (previewInterval) {
      stopPreview();
    } else {
      startPreview();
    }
  }

  function closePreview() {
    stopPreview();
    previewOverlay.classList.remove('active');
    previewAnimationFrame = 0;
  }

  speedSlider.addEventListener('input', (e) => {
    currentSpeed = parseFloat(e.target.value);
    speedValue.textContent = currentSpeed.toFixed(1);
    if (previewInterval) {
      stopPreview();
      startPreview();
    }
  });

  previewStage.addEventListener('click', togglePreview);
  closePreviewBtn.addEventListener('click', closePreview);
  previewGifBtn.addEventListener('click', startPreview);

  async function generateGif(forExport) {
    if (frames.length === 0) {
      alert('No frames to export!');
      return;
    }

    try {
      const gif = GIFEncoder();
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

      for (const frameData of frames) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            tempCtx.fillStyle = frameData[r][c];
            tempCtx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
          }
        }

        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const palette = quantize(imageData.data, 256, { format: 'rgba4444' });
        const index = applyPalette(imageData.data, palette, { format: 'rgba4444' });
        gif.writeFrame(index, tempCanvas.width, tempCanvas.height, { palette, delay: 200 / currentSpeed });
      }

      gif.finish();
      const buffer = gif.bytes();
      const blob = new Blob([buffer], { type: 'image/gif' });

      if (forExport) {
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = 'dot-animation.gif';
        downloadLink.click();
      }
    } catch (error) {
      console.error('GIF generation error:', error);
      alert('Error generating GIF: ' + error.message);
    }
  }

  exportGifBtn.addEventListener('click', () => generateGif(true));

  const gridOpacitySlider = document.getElementById('gridOpacitySlider');
  const gridOpacityValue = document.getElementById('gridOpacityValue');

  if (gridOpacitySlider && gridOpacityValue) {
    gridOpacitySlider.addEventListener('input', (e) => {
      currentGridOpacity = parseFloat(e.target.value);
      gridOpacityValue.textContent = currentGridOpacity.toFixed(1);
      drawGrid();
    });
  }

  // Initial setup
  // Initial setup
  const initialSize = parseInt(canvasSizeSelect.value.split('x')[0]) || 32;

  // Define BACKGROUND_COLOR again if needed, or rely on top level. 
  // Better: Reset logic
  function hardReset() {
    applyCanvasSize(initialSize * PIXEL_SIZE, initialSize * PIXEL_SIZE);
    if (!frames.length) {
      console.warn('Frames empty after applyCanvasSize. Forcing init.');
      frames = [createGrid(initialSize, initialSize)];
      history = [JSON.parse(JSON.stringify(frames))];
      historyIndex = [0];
      currentFrameIndex = 0;
    }
    setActiveToolButton('pen');
    paletteColors = document.querySelectorAll('.palette-color');
    setActivePaletteColor(currentColor);
    drawGrid();
    renderFrameThumbnails();
  }

  hardReset();
});
