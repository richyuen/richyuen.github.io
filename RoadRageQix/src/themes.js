/** Per-level themes in deterministic order */
export const LEVEL_THEMES = [
  { name: "Wasteland", bg1: "#6f4a2f", bg2: "#423021", bg3: "#1e1712", terrainBase: [118, 100, 78], terrainHighlight: "rgba(255, 236, 208, 0.16)", border: "#dccab0", edge: "rgba(255, 123, 68, 0.66)", edgeBright: "rgba(255, 245, 220, 0.98)", grid: "rgba(255, 196, 132, 0.03)", hillColor: "#201713", hudAccent: "#f5d4a5" },
  { name: "Midnight", bg1: "#1a2a4f", bg2: "#0f1a33", bg3: "#070d1a", terrainBase: [60, 80, 130], terrainHighlight: "rgba(160, 190, 255, 0.16)", border: "#8899cc", edge: "rgba(100, 160, 255, 0.66)", edgeBright: "rgba(200, 220, 255, 0.98)", grid: "rgba(100, 160, 255, 0.03)", hillColor: "#0a0f20", hudAccent: "#a8c4f5" },
  { name: "Inferno", bg1: "#5f1a0a", bg2: "#3a0f06", bg3: "#1a0800", terrainBase: [130, 60, 40], terrainHighlight: "rgba(255, 180, 140, 0.16)", border: "#cc7755", edge: "rgba(255, 80, 30, 0.66)", edgeBright: "rgba(255, 200, 150, 0.98)", grid: "rgba(255, 100, 50, 0.03)", hillColor: "#1a0800", hudAccent: "#ffb080" },
  { name: "Toxic", bg1: "#2a4f1a", bg2: "#1a3310", bg3: "#0d1a08", terrainBase: [70, 120, 60], terrainHighlight: "rgba(180, 255, 160, 0.16)", border: "#88cc77", edge: "rgba(100, 255, 80, 0.66)", edgeBright: "rgba(200, 255, 200, 0.98)", grid: "rgba(100, 255, 80, 0.03)", hillColor: "#0a1508", hudAccent: "#b0f5a0" },
  { name: "Sandstorm", bg1: "#7f6a3f", bg2: "#5a4a2a", bg3: "#2a2010", terrainBase: [140, 125, 90], terrainHighlight: "rgba(255, 240, 190, 0.16)", border: "#ccbb88", edge: "rgba(255, 210, 100, 0.66)", edgeBright: "rgba(255, 245, 200, 0.98)", grid: "rgba(255, 210, 100, 0.03)", hillColor: "#2a2010", hudAccent: "#f5e0a0" },
  { name: "Frostbite", bg1: "#2a4a5f", bg2: "#1a3040", bg3: "#0a1820", terrainBase: [70, 110, 135], terrainHighlight: "rgba(200, 240, 255, 0.16)", border: "#88bbcc", edge: "rgba(130, 210, 255, 0.66)", edgeBright: "rgba(220, 240, 255, 0.98)", grid: "rgba(130, 210, 255, 0.03)", hillColor: "#0a1520", hudAccent: "#a0d8f5" },
  { name: "Crimson Dusk", bg1: "#5f2a3a", bg2: "#3a1520", bg3: "#1a0a10", terrainBase: [130, 70, 90], terrainHighlight: "rgba(255, 190, 210, 0.16)", border: "#cc7799", edge: "rgba(255, 100, 140, 0.66)", edgeBright: "rgba(255, 210, 220, 0.98)", grid: "rgba(255, 100, 140, 0.03)", hillColor: "#1a0a10", hudAccent: "#f5a0b8" },
  { name: "Void", bg1: "#1a1a2f", bg2: "#10101f", bg3: "#080810", terrainBase: [80, 70, 120], terrainHighlight: "rgba(200, 180, 255, 0.16)", border: "#9988cc", edge: "rgba(180, 130, 255, 0.66)", edgeBright: "rgba(230, 210, 255, 0.98)", grid: "rgba(180, 130, 255, 0.03)", hillColor: "#080810", hudAccent: "#c8b0f5" },
];

export function getThemeForLevel(level) {
  return LEVEL_THEMES[(level - 1) % LEVEL_THEMES.length];
}
