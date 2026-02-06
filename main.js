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
  let paletteColors;
  let recentColors = [];

  const PIXEL_SIZE = 10;
  let COLS = canvas.width / PIXEL_SIZE;
  let ROWS = canvas.height / PIXEL_SIZE;

  let currentColor = colorPicker.value;
  let isDrawing = false;
  let frames = [];
  let history = [];
  let historyIndex = [];
  let currentFrameIndex = 0;
  let currentTool = 'pen';
  let currentPenThickness = 1;
  let currentEraserThickness = 1;

  const BACKGROUND_COLOR = '#FFFFFF';

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
    console.log('drawGrid finished drawing pixels.');
  }

  function updateFrameIndicator() {
    frameIndicator.textContent = `${currentFrameIndex + 1} / ${frames.length}`;
    if (history[currentFrameIndex]) {
      updateUndoRedoButtons();
    }
  }

  function applyCanvasSize(newWidth, newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    COLS = canvas.width / PIXEL_SIZE;
    ROWS = canvas.height / PIXEL_SIZE;
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

    // Limit to 4 colors
    if (recentColors.length > 4) {
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

  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    if (currentTool !== 'eyedropper') {
      saveState();
      addToRecentColors(currentColor);
    }
    drawPixel(e);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isDrawing && currentTool !== 'eyedropper') {
      drawPixel(e);
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDrawing = false;
  });
  canvas.addEventListener('mouseleave', () => {
    console.log('mouseleave event triggered. isDrawing set to false.');
    isDrawing = false;
  });

  function drawPixel(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / PIXEL_SIZE);
    const row = Math.floor(y / PIXEL_SIZE);

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

    if (currentTool === 'eyedropper') {
      const pickedColor = frames[currentFrameIndex][row][col];
      if (pickedColor && pickedColor !== BACKGROUND_COLOR) {
        updateCurrentColor(pickedColor);
        // Switch back to pen after picking color
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

  addFrameBtn.addEventListener('click', () => {
    console.log('Add Frame button clicked.');
    const newGrid = JSON.parse(JSON.stringify(frames[currentFrameIndex]));
    frames.splice(currentFrameIndex + 1, 0, newGrid);
    const newHistory = [JSON.parse(JSON.stringify(newGrid))];
    history.splice(currentFrameIndex + 1, 0, newHistory);
    historyIndex.splice(currentFrameIndex + 1, 0, 0);
    currentFrameIndex++;
    updateFrameIndicator();
    drawGrid();
    saveState();
  });

  deleteFrameBtn.addEventListener('click', () => {
    if (frames.length > 1) {
      frames.splice(currentFrameIndex, 1);
      history.splice(currentFrameIndex, 1);
      historyIndex.splice(currentFrameIndex, 1);
      if (currentFrameIndex >= frames.length) {
        currentFrameIndex = frames.length - 1;
      }
      updateFrameIndicator();
      drawGrid();
    } else {
      alert('Cannot delete the last frame!');
    }
  });

  prevFrameBtn.addEventListener('click', () => {
    if (currentFrameIndex > 0) {
      currentFrameIndex--;
      updateFrameIndicator();
      drawGrid();
    }
  });

  nextFrameBtn.addEventListener('click', () => {
    if (currentFrameIndex < frames.length - 1) {
      currentFrameIndex++;
      updateFrameIndicator();
      drawGrid();
    }
  });


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

  // Initial setup
  applyCanvasSize(parseInt(customWidthInput.value), parseInt(customHeightInput.value));
  setActiveToolButton('pen');
  paletteColors = document.querySelectorAll('.palette-color');
  setActivePaletteColor(currentColor);
});
