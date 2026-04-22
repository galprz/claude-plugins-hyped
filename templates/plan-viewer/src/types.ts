export interface Flag {
  type: 'risk' | 'question' | 'ambiguity'
  text: string
  suggestions?: string[]
}

export interface PlanStep {
  label: string
  code?: string
}

export interface PlanTask {
  id: string
  title: string
  steps: PlanStep[]
  flags?: Flag[]
}

export interface PlanData {
  title: string
  goal: string
  tasks: PlanTask[]
}
