export interface StoredGraphProject<TGraph = unknown> {
  name: string;
  graph: TGraph;
  updatedAt: string;
}

const PROJECT_INDEX_KEY = "plotterfun.projects";
const PROJECT_KEY_PREFIX = "plotterfun.project.";

export const UNTITLED_PROJECT_NAME = "Senza nome";

export function normalizeProjectName(value: string) {
  return value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100);
}

function projectStorageKey(name: string) {
  return `${PROJECT_KEY_PREFIX}${encodeURIComponent(name)}`;
}

export function getProjectNameFromUrl() {
  return normalizeProjectName(new URLSearchParams(window.location.search).get("project") ?? "");
}

export function setProjectNameInUrl(name: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("project", name);
  window.history.replaceState({}, "", url);
}

export function listGraphProjects() {
  try {
    const value = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((name): name is string => typeof name === "string").sort((a, b) => a.localeCompare(b, "it"))
      : [];
  } catch {
    return [];
  }
}

export function saveGraphProject<TGraph>(name: string, graph: TGraph) {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) throw new Error("Project name is required.");
  const project: StoredGraphProject<TGraph> = {
    name: normalizedName,
    graph,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(projectStorageKey(normalizedName), JSON.stringify(project));
  const names = [...new Set([...listGraphProjects(), normalizedName])].sort((a, b) => a.localeCompare(b, "it"));
  localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(names));
  return project;
}

export function loadGraphProject<TGraph>(name: string): StoredGraphProject<TGraph> | null {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) return null;
  try {
    const project = JSON.parse(localStorage.getItem(projectStorageKey(normalizedName)) ?? "null") as StoredGraphProject<TGraph> | null;
    return project?.name && project.graph ? project : null;
  } catch {
    return null;
  }
}
