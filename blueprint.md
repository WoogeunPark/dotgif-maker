# AI Development Guidelines for Modern Web Projects in Firebase Studio

## Project Overview

The "dotgif-maker" is a framework-less web project designed to create GIFs. It leverages modern web standards (HTML, CSS, JavaScript) and is intended to run within the Firebase Studio environment. The project aims to provide an efficient, automated, and error-resilient application design and development workflow.

## Current Features

### Core Functionality
*   **GIF Creation:** Users can create GIFs based on various inputs.
*   **Color Selection:** Provides options for color selection, including a pre-defined palette and a custom color feature with a toggle.
*   **Pen Tool Activation on Color Selection:** Automatically switches to the Pen tool when a color is selected.
*   **Undo/Redo:** History management for drawing actions.

## Planned Enhancements (Current Task)

### Goal
Fix critical bugs reported by the user: non-functional drawing and general unresponsiveness.

### Debug Drawing and Responsiveness
*   **Objective:** Identify why the drawing functionality and other core features are currently unresponsive.
*   **Hypothesis:** The regression may have been introduced by recent changes related to the canvas context or subtle issues in the drawing/rendering loop.
*   **Steps:**
    1.  **Removed `willReadFrequently` option:** Eliminated `{ willReadFrequently: true }` from `canvas.getContext('2d')` in `main.js` to rule out compatibility issues.
    2.  **Added extensive console logging:** Integrated `console.log` statements into `mousedown`, `mousemove`, `drawPixel`, and `drawGrid` functions in `main.js` to trace execution flow and data states during drawing attempts.
    3.  **Awaiting user feedback with console logs:** The next step relies on the user providing console output when attempting to draw, to pinpoint where the execution flow breaks or where data becomes inconsistent.

## Automated Error Detection & Remediation
*   Post-modification checks: Monitors IDE diagnostics and browser console for errors.
*   Automatic error correction: Attempts to fix syntax errors, incorrect file paths, and common JavaScript runtime errors.
*   Problem Reporting: Reports unresolved errors with location and explanation.

## Visual Design & Accessibility
*   Aesthetics: Focus on modern components, balanced layout, polished styles, mobile responsiveness.
*   Bold Definition: Uses interactive iconography, images, and UI components with expressive typography, vibrant colors, subtle textures, visual effects (drop shadows), and interactive elements with "glow" effects.
*   Accessibility: Implements A11Y standards for diverse users.