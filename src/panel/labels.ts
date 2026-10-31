export type PanelLabels = {
  title: string
  system: string
  cpu: string
  ram: string
  gpu: string
  vram: string
  network: string
  git: string
}

const labels: Record<string, PanelLabels> = {
  de: { title: "Systemmetriken", system: "System", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Netz", git: "Git" },
  es: { title: "Métricas del sistema", system: "Sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Red", git: "Git" },
  fr: { title: "Métriques système", system: "Système", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Réseau", git: "Git" },
  it: { title: "Metriche di sistema", system: "Sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Rete", git: "Git" },
  pt: { title: "Métricas do sistema", system: "Sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Rede", git: "Git" },
}

const english: PanelLabels = { title: "System metrics", system: "System", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Network", git: "Git" }

export function getPanelLabels(locale: string): PanelLabels {
  return labels[locale.split(/[-_.]/)[0].toLowerCase()] ?? english
}
