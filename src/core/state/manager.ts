/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * State file manager
 *
 * Handles loading and saving deployment state to the filesystem.
 */

import fs from "node:fs";
import path from "node:path";
import type { DeploymentState, StateOptions } from "../../types/state.js";

/**
 * Default state directory
 */
export const DEFAULT_STATE_DIR = ".deploy";

/**
 * State format version
 */
export const STATE_VERSION = "1.0.0";

/**
 * Get state file path
 */
export function getStateFilePath(options: StateOptions = {}): string {
  const { stateDir = DEFAULT_STATE_DIR, environment = "default" } = options;

  const fileName =
    environment === "default" ? "state.json" : `state.${environment}.json`;

  return path.join(process.cwd(), stateDir, fileName);
}

/**
 * Check if state file exists
 */
export function stateExists(options: StateOptions = {}): boolean {
  const filePath = getStateFilePath(options);
  return fs.existsSync(filePath);
}

/**
 * Load state from file
 */
export function loadState(options: StateOptions = {}): DeploymentState | null {
  const filePath = getStateFilePath(options);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const state = JSON.parse(content) as DeploymentState;

    // Validate basic structure
    if (!state.app || !state.environment || !state.resources) {
      throw new Error("Invalid state file structure");
    }

    return state;
  } catch (error: any) {
    throw new Error(`Failed to load state file: ${error.message}`);
  }
}

/**
 * Save state to file
 */
export function saveState(
  state: DeploymentState,
  options: StateOptions = {}
): void {
  const filePath = getStateFilePath(options);
  const stateDir = path.dirname(filePath);

  // Ensure state directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  try {
    // Add version if not present
    if (!state.version) {
      state.version = STATE_VERSION;
    }

    // Update lastDeployed timestamp
    state.lastDeployed = new Date().toISOString();

    // Write state file
    const content = JSON.stringify(state, null, 2);
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (error: any) {
    throw new Error(`Failed to save state file: ${error.message}`);
  }
}

/**
 * Delete state file
 */
export function deleteState(options: StateOptions = {}): boolean {
  const filePath = getStateFilePath(options);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);

    // Remove state directory if empty
    const stateDir = path.dirname(filePath);
    const files = fs.readdirSync(stateDir);

    if (files.length === 0) {
      fs.rmdirSync(stateDir);
    }

    return true;
  } catch (error: any) {
    throw new Error(`Failed to delete state file: ${error.message}`);
  }
}

/**
 * Initialize empty state
 */
export function initializeState(
  app: string,
  environment: string = "default"
): DeploymentState {
  return {
    app,
    environment,
    lastDeployed: new Date().toISOString(),
    resources: {},
    files: {},
    version: STATE_VERSION,
  };
}

/**
 * Get or create state
 */
export function getOrCreateState(
  app: string,
  options: StateOptions = {}
): DeploymentState {
  const { environment = "default" } = options;

  const existingState = loadState(options);

  if (existingState) {
    return existingState;
  }

  return initializeState(app, environment);
}

/**
 * List all state files in directory
 */
export function listStateFiles(stateDir: string = DEFAULT_STATE_DIR): string[] {
  const stateDirPath = path.join(process.cwd(), stateDir);

  if (!fs.existsSync(stateDirPath)) {
    return [];
  }

  try {
    const files = fs.readdirSync(stateDirPath);
    return files.filter(
      (file) => file.startsWith("state") && file.endsWith(".json")
    );
  } catch (error) {
    console.error(`Failed to list state files: ${error}`);
    return [];
  }
}

/**
 * Get state directory path
 */
export function getStateDir(stateDir: string = DEFAULT_STATE_DIR): string {
  return path.join(process.cwd(), stateDir);
}

/**
 * Ensure state directory exists
 */
export function ensureStateDir(stateDir: string = DEFAULT_STATE_DIR): void {
  const stateDirPath = getStateDir(stateDir);

  if (!fs.existsSync(stateDirPath)) {
    fs.mkdirSync(stateDirPath, { recursive: true });
  }
}
