export type PanelLabels = {
  title: string
  cpu: string
  ram: string
  gpu: string
  vram: string
  network: string
  git: string
}

const labels: Record<string, PanelLabels> = {
  de: { title: "Systemmetriken", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Netz", git: "Git" },
  es: { title: "Métricas del sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Red", git: "Git" },
  fr: { title: "Métriques système", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Réseau", git: "Git" },
  it: { title: "Metriche di sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Rete", git: "Git" },
  pt: { title: "Métricas do sistema", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Rede", git: "Git" },
}

const english: PanelLabels = { title: "System metrics", cpu: "CPU", ram: "RAM", gpu: "GPU", vram: "VRAM", network: "Network", git: "Git" }

export function getPanelLabels(locale: string): PanelLabels {
  return labels[locale.split(/[-_.]/)[0].toLowerCase()] ?? english
}
