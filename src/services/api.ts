const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export type Account = {
  id: number;
  email: string;
  fullName: string;
  role: string;
};

export type RoadmapTask = {
  id: number;
  title: string;
  skill: string;
  completed: boolean;
  priority: number;
  estimatedMinutes: number;
};

export type SkillAnalysis = {
  summary: string;
  targetRole: string;
  readinessPercent: number;
  proficientSkills: string[];
  skillGaps: string[];
  criticalSkills: string[];
  focusAreas: string[];
  topRoles: string[];
  roleMatches: { title: string; readinessPercent: number }[];
  nextSteps: string[];
  analysisMethod: 'GEMINI' | 'DETERMINISTIC_FALLBACK';
};

export type TargetRole = { targetRole: string };

export type Progress = {
  assessmentComplete: boolean;
  completedModules: number;
  totalModules: number;
  completionPercent: number;
  estimatedHoursCompleted: number;
  remainingSkills: string[];
};

export type InterviewQuestion = { category: string; difficulty: string; prompt: string; skill: string };
export type InterviewFeedback = { practiceScore: number; feedback: string; evaluationMethod: string };

export type SkillScores = Record<string, number>;

function authorization(email: string, password: string): string {
  const bytes = new TextEncoder().encode(`${email}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}

async function request<T>(path: string, options: RequestInit = {}, credentials?: { email: string; password: string }): Promise<T> {
  if (!API_BASE) {
    throw new Error('Backend URL is not configured. Set VITE_API_URL in the frontend environment.');
  }
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (credentials) headers.set('Authorization', authorization(credentials.email, credentials.password));

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
    throw new Error(body?.detail ?? body?.message ?? (response.status === 401 ? 'Email or password is incorrect.' : `Request failed (${response.status}).`));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  register: (data: { email: string; password: string; fullName: string; role: string }) =>
    request<Account>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: (credentials: { email: string; password: string }) => request<Account>('/api/auth/me', {}, credentials),
  getTargetRole: (credentials: { email: string; password: string }) => request<TargetRole>('/api/profile/target-role', {}, credentials),
  saveTargetRole: (targetRole: string, credentials: { email: string; password: string }) =>
    request<TargetRole>('/api/profile/target-role', { method: 'PUT', body: JSON.stringify({ targetRole }) }, credentials),
  getScores: (credentials: { email: string; password: string }) => request<{ skill: string; rating: number }[]>('/api/assessment', {}, credentials),
  saveScores: (scores: SkillScores, credentials: { email: string; password: string }) =>
    request('/api/assessment', { method: 'PUT', body: JSON.stringify(scores) }, credentials),
  getRoadmap: (credentials: { email: string; password: string }) => request<RoadmapTask[]>('/api/roadmap', {}, credentials),
  addRoadmapTask: (task: { title: string; skill: string }, credentials: { email: string; password: string }) =>
    request<RoadmapTask>('/api/roadmap', { method: 'POST', body: JSON.stringify(task) }, credentials),
  updateRoadmapTask: (id: number, completed: boolean, credentials: { email: string; password: string }) =>
    request<RoadmapTask>(`/api/roadmap/${id}`, { method: 'PUT', body: JSON.stringify({ completed }) }, credentials),
  generateRoadmap: (credentials: { email: string; password: string }) =>
    request<RoadmapTask[]>('/api/roadmap/generate', { method: 'POST' }, credentials),
  getProgress: (credentials: { email: string; password: string }) => request<Progress>('/api/progress', {}, credentials),
  getInterviewQuestions: (credentials: { email: string; password: string }) =>
    request<InterviewQuestion[]>('/api/interview/questions', {}, credentials),
  evaluateInterviewAnswer: (answer: string, credentials: { email: string; password: string }) =>
    request<InterviewFeedback>('/api/interview/evaluate', { method: 'POST', body: JSON.stringify({ answer }) }, credentials),
  analyzeSkills: (credentials: { email: string; password: string }) =>
    request<SkillAnalysis>('/api/analysis', { method: 'POST' }, credentials),
};
