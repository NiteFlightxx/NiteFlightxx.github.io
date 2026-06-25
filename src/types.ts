export interface Project {
  id: string;
  title: string;
  category: "Physics Simulation" | "Animation Technical Art" | "Gameplay Systems" | "Real-time Rendering";
  description: string;
  extendedDetails: string;
  tech: string[];
  metrics: { label: string; value: string }[];
  visualPrompt: string; // Used for descriptive visuals
  codeSnippet?: string;
  mediaUrl?: string;
}

export interface BlogArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  readTime: string;
  category: string;
  tags: string[];
}

export interface ResearchNote {
  id: string;
  title: string;
  mathFormula?: string;
  mathLabel?: string;
  problem: string;
  solution: string;
  implementationDetails: string;
  cppCode?: string;
  hlslCode?: string;
  date: string;
}

export interface SkillCategory {
  name: string;
  skills: { name: string; proficiency: number; details: string }[];
}

export interface TimelineEvent {
  year: string;
  role: string;
  company: string;
  description: string;
  highlights: string[];
}
