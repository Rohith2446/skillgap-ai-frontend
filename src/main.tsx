import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Account, type InterviewFeedback, type InterviewQuestion, type Progress, type RoadmapTask, type SkillAnalysis, type SkillScores } from './services/api';
import './styles.css';

type AuthMode = 'login' | 'register';
type Credentials = { email: string; password: string };
type View = 'overview' | 'assessment' | 'analysis' | 'roadmap' | 'progress' | 'interview';

const skills = ['Java', 'SQL', 'Communication', 'Problem solving', 'Data analysis', 'Cloud fundamentals'];
const ratingLabels = ['New', 'Beginner', 'Developing', 'Intermediate', 'Advanced', 'Confident'];
const blankScores = Object.fromEntries(skills.map((skill) => [skill, 0])) as SkillScores;

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [scores, setScores] = useState<SkillScores>(blankScores);
  const [ratedSkills, setRatedSkills] = useState<Set<string>>(new Set());
  const [targetRole, setTargetRole] = useState('Backend Developer');
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [progress, setProgress] = useState<Progress>({ assessmentComplete: false, completedModules: 0, totalModules: 0, completionPercent: 0, estimatedHoursCompleted: 0, remainingSkills: [] });
  const [analysis, setAnalysis] = useState<SkillAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [interviewFeedback, setInterviewFeedback] = useState<InterviewFeedback | null>(null);
  const [view, setView] = useState<View>('overview');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);

  useEffect(() => {
    localStorage.removeItem('skillgap.credentials');
  }, []);

  useEffect(() => {
    if (!credentials) {
      setAccountLoading(false);
      return;
    }
    let active = true;
    const activeCredentials = credentials;
    setAccountLoading(true);
    async function restoreAnalysis() {
      setAnalysisLoading(true);
      setAnalysisError('');
      try {
        const restoredAnalysis = await api.analyzeSkills(activeCredentials);
        if (active) setAnalysis(restoredAnalysis);
      } catch (error) {
        if (active) {
          setAnalysis(null);
          setAnalysisError(error instanceof Error ? error.message : 'Could not load your skill analysis.');
        }
      } finally {
        if (active) setAnalysisLoading(false);
      }
    }
    Promise.all([api.me(credentials), api.getScores(credentials), api.getRoadmap(credentials), api.getTargetRole(credentials), api.getProgress(credentials)])
      .then(([user, savedScores, savedTasks, savedRole, savedProgress]) => {
        if (!active) return;
        const nextScores = { ...blankScores, ...Object.fromEntries(savedScores.map(({ skill, rating }) => [skill, rating])) };
        if (savedScores.length === skills.length) {
          void restoreAnalysis();
        } else {
          setAnalysis(null);
          setAnalysisError('');
        }
        setAccount(user);
        setScores(nextScores);
        setRatedSkills(new Set(savedScores.map(({ skill }) => skill)));
        setTasks(savedTasks);
        setProgress(savedProgress);
        setTargetRole(savedRole.targetRole);
      })
      .catch((error) => {
        if (!active) return;
        setCredentials(null);
        setAccount(null);
        setNotice(error instanceof Error ? error.message : 'Could not load your account. Check your connection and try again.');
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });
    return () => { active = false; };
  }, [credentials]);

  async function authenticate(mode: AuthMode, data: { fullName: string; email: string; password: string; role: string }) {
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'register') await api.register(data);
      const nextCredentials = { email: data.email, password: data.password };
      setAccount(null);
      setAccountLoading(true);
      setCredentials(nextCredentials);
      setTargetRole('Backend Developer');
      setAnalysis(null);
      setAnalysisLoading(false);
      setAnalysisError('');
      setView('overview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAssessment() {
    if (!credentials) return;
    if (ratedSkills.size !== skills.length) {
      setNotice('Select a rating for every skill before saving your assessment.');
      return;
    }
    setBusy(true);
    try {
      await api.saveScores(scores, credentials);
      await api.saveTargetRole(targetRole, credentials);
      await refreshAnalysis();
      setRatedSkills(new Set(skills));
      setProgress(await api.getProgress(credentials));
      setNotice('Assessment saved. Your role analysis is ready to review.');
      setView('analysis');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save assessment.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshAnalysis() {
    if (!credentials) return;
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      setAnalysis(await api.analyzeSkills(credentials));
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(error instanceof Error ? error.message : 'Could not load your skill analysis.');
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function addTask(title: string, skill: string) {
    if (!credentials) return;
    try {
      const created = await api.addRoadmapTask({ title, skill }, credentials);
      setTasks((current) => [...current, created]);
      setProgress(await api.getProgress(credentials));
      setNotice('Added to your roadmap.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add roadmap task.');
    }
  }

  async function toggleTask(task: RoadmapTask) {
    if (!credentials) return;
    try {
      const updated = await api.updateRoadmapTask(task.id, !task.completed, credentials);
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setProgress(await api.getProgress(credentials));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update task.');
    }
  }

  async function generateRoadmap() {
    if (!credentials) return;
    setBusy(true);
    try {
      setTasks(await api.generateRoadmap(credentials));
      setProgress(await api.getProgress(credentials));
      setNotice('Role-focused roadmap generated from your saved skill gaps.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not generate roadmap.');
    } finally {
      setBusy(false);
    }
  }

  async function openInterview() {
    if (!credentials) return;
    setInterviewFeedback(null);
    setBusy(true);
    try {
      setInterviewQuestions(await api.getInterviewQuestions(credentials));
      setView('interview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load interview questions.');
    } finally {
      setBusy(false);
    }
  }

  async function evaluateInterviewAnswer(answer: string) {
    if (!credentials) throw new Error('Sign in to continue.');
    const feedback = await api.evaluateInterviewAnswer(answer, credentials);
    setInterviewFeedback(feedback);
    return feedback;
  }

  function signOut() {
    setCredentials(null);
    setAccount(null);
    setScores(blankScores);
    setRatedSkills(new Set());
    setTargetRole('Backend Developer');
    setAnalysis(null);
    setTasks([]);
    setProgress({ assessmentComplete: false, completedModules: 0, totalModules: 0, completionPercent: 0, estimatedHoursCompleted: 0, remainingSkills: [] });
    setInterviewQuestions([]);
    setInterviewFeedback(null);
  }

  if (!credentials || !account) {
    if (accountLoading) return <LoadingScreen label="Loading your career workspace" />;
    return <AuthScreen onAuthenticate={authenticate} notice={notice} busy={busy} />;
  }

  const hasAssessment = ratedSkills.size === skills.length;
  const average = hasAssessment ? Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) / skills.length * 20) : null;
  const matches = analysis?.roleMatches.map(({ title, readinessPercent }) => ({ title, score: readinessPercent })) ?? [];
  const weakest = hasAssessment ? [...skills].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0)).slice(0, 3) : [];
  const completedTasks = tasks.filter((task) => task.completed).length;
  const pageTitles: Record<View, string> = { overview: 'Your career overview', assessment: 'Skill assessment', analysis: 'Skill gap analysis', roadmap: 'Your learning roadmap', progress: 'Progress tracker', interview: 'Interview preparation' };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="eyebrow">WORKSPACE</p>
        <nav className="nav-list" aria-label="Main navigation">
          <NavButton active={view === 'overview'} icon="◫" label="Overview" onClick={() => { setView('overview'); setNotice(''); }} />
          <NavButton active={view === 'assessment'} icon="◎" label="Skill assessment" onClick={() => { setView('assessment'); setNotice(''); }} />
          <NavButton active={view === 'analysis'} icon="⌕" label="Skill gap analysis" onClick={() => { setView('analysis'); setNotice(''); }} />
          <NavButton active={view === 'roadmap'} icon="↗" label="My roadmap" onClick={() => { setView('roadmap'); setNotice(''); }} />
          <NavButton active={view === 'progress'} icon="✓" label="Progress tracker" onClick={() => { setView('progress'); setNotice(''); }} />
          <NavButton active={view === 'interview'} icon="◇" label="Interview prep" onClick={openInterview} />
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{initials(account.fullName)}</span>
          <div><strong>{account.fullName}</strong><small>{account.role.toLowerCase()}</small></div>
          <button className="signout-button" type="button" title="Sign out" onClick={signOut}>↪</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><p className="eyebrow">CAREER INTELLIGENCE</p><h1>{pageTitles[view]}</h1></div>
          <div className="top-actions"><span className="status-pill"><i /> Account connected</span><span className="avatar small" aria-hidden="true">{initials(account.fullName)}</span><button className="top-signout" type="button" onClick={signOut}>Sign out</button></div>
        </header>
        {notice && <div className="notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

        {view === 'overview' && <Overview account={account} average={average} hasAssessment={hasAssessment} matches={matches} scores={scores} tasks={tasks} weakest={weakest} analysis={analysis} onAssess={() => setView('assessment')} onAnalysis={() => setView('analysis')} onAddTask={addTask} onGoRoadmap={() => setView('roadmap')} />}
        {view === 'assessment' && <Assessment scores={scores} setScores={setScores} ratedSkills={ratedSkills} setRatedSkills={setRatedSkills} targetRole={targetRole} setTargetRole={setTargetRole} onSave={saveAssessment} busy={busy} />}
        {view === 'analysis' && <AnalysisView analysis={analysis} loading={analysisLoading} error={analysisError} hasAssessment={hasAssessment} onAssess={() => setView('assessment')} onRetry={refreshAnalysis} />}
        {view === 'roadmap' && <Roadmap tasks={tasks} completed={completedTasks} weakest={weakest} onAddTask={addTask} onToggle={toggleTask} onGenerate={generateRoadmap} busy={busy} />}
        {view === 'progress' && <ProgressTracker progress={progress} />}
        {view === 'interview' && <InterviewPrep questions={interviewQuestions} targetRole={targetRole} feedback={interviewFeedback} onEvaluate={evaluateInterviewAnswer} />}
      </main>
    </div>
  );
}

function AuthScreen({ onAuthenticate, notice, busy }: { onAuthenticate: (mode: AuthMode, data: { fullName: string; email: string; password: string; role: string }) => void; notice: string; busy: boolean }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [role, setRole] = useState('STUDENT');
  const [validationError, setValidationError] = useState('');
  const isRegister = mode === 'register';

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 10) {
      setValidationError('Password must contain at least 10 characters.');
      return;
    }
    if (isRegister && password !== form.get('confirmPassword')) {
      setValidationError('The passwords do not match.');
      return;
    }
    setValidationError('');
    onAuthenticate(mode, {
      fullName: `${String(form.get('firstName') ?? '').trim()} ${String(form.get('lastName') ?? '').trim()}`.trim(),
      email: String(form.get('email') ?? '').trim(),
      password,
      role,
    });
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <section className="auth-visual">
          <Brand />
          <div className="visual-copy"><p className="eyebrow auth-eyebrow">CAREER INTELLIGENCE</p><h1>Understand your skills. Identify your gaps. Build your career path.</h1><p>Use your assessment to compare supported roles, create a focused learning plan, and practice for interviews.</p></div>
          <ol className="workflow-steps"><li><span>01</span>Assess your skills</li><li><span>02</span>Review role fit and gaps</li><li><span>03</span>Build a roadmap</li><li><span>04</span>Track completed tasks</li><li><span>05</span>Practice interview questions</li></ol>
        </section>
        <section className="auth-form-panel">
          <div className="auth-header"><div className="tabs" role="tablist" aria-label="Authentication mode"><button className={mode === 'login' ? 'tab active' : 'tab'} type="button" onClick={() => { setMode('login'); setValidationError(''); }}>Sign in</button><button className={isRegister ? 'tab active' : 'tab'} type="button" onClick={() => { setMode('register'); setValidationError(''); }}>Create account</button></div><p className="eyebrow small">YOUR NEXT MOVE STARTS HERE</p></div>
          {isRegister && <div className="role-switcher" aria-label="Account type"><button type="button" className={role === 'STUDENT' ? 'role-button active' : 'role-button'} onClick={() => setRole('STUDENT')}>Student</button><button type="button" className={role === 'RECRUITER' ? 'role-button active' : 'role-button'} onClick={() => setRole('RECRUITER')}>Recruiter</button></div>}
          <form className="auth-form" onSubmit={submit}>
            {isRegister && <div className="field-row two-columns"><label><span>First name</span><input name="firstName" required autoComplete="given-name" placeholder="Alex" /></label><label><span>Last name</span><input name="lastName" required autoComplete="family-name" placeholder="Kumar" /></label></div>}
            <label><span>Email address</span><input type="email" name="email" required autoComplete="email" placeholder="you@example.com" /></label>
            <label><span>Password</span><input type="password" name="password" required minLength={10} maxLength={72} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'At least 10 characters' : 'Enter your password'} /></label>
            {isRegister && <label><span>Confirm password</span><input type="password" name="confirmPassword" required minLength={10} autoComplete="new-password" placeholder="Re-enter your password" /></label>}
            {(validationError || notice) && <p className="form-error" role="alert">{validationError || notice}</p>}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create my account' : 'Sign in'}<span>→</span></button>
          </form>
          <p className="auth-footnote">{isRegister ? 'Your password is securely encrypted before it is stored.' : 'New to Skillgap AI? Create an account to save your progress.'}</p>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-page" aria-live="polite"><Brand /><span className="loading-indicator" aria-hidden="true" /><p>{label}</p></main>;
}

function AnalysisView({ analysis, loading, error, hasAssessment, onAssess, onRetry }: { analysis: SkillAnalysis | null; loading: boolean; error: string; hasAssessment: boolean; onAssess: () => void; onRetry: () => void }) {
  if (!hasAssessment) {
    return <section className="panel analysis-empty"><span className="section-mark">01</span><div><p className="eyebrow">YOUR PROFILE</p><h3>Complete your assessment first</h3><p>Rate all supported skills to see role readiness, skill gaps, and recommended next steps.</p></div><button type="button" className="primary-button" onClick={onAssess}>Start assessment <span>→</span></button></section>;
  }
  if (loading) {
    return <section className="panel analysis-loading" aria-live="polite"><span className="loading-indicator" aria-hidden="true" /><div><p className="eyebrow">SKILL GAP ANALYSIS</p><h3>Preparing your role comparison</h3><p>Using your saved assessment and target role.</p></div></section>;
  }
  if (!analysis) {
    return <section className="panel analysis-empty" role="alert"><span className="section-mark">!</span><div><p className="eyebrow">ANALYSIS UNAVAILABLE</p><h3>We couldn’t load your skill analysis</h3><p>{error || 'Your assessment is saved. Try loading the analysis again.'}</p></div><button type="button" className="secondary-action" onClick={onRetry}>Retry analysis</button></section>;
  }

  return <div className="analysis-page">
    <section className="analysis-hero"><div><p className="eyebrow light">ROLE READINESS</p><h2>{analysis.targetRole}</h2><p>{analysis.summary}</p><span className="analysis-source">{analysis.analysisMethod === 'GEMINI' ? 'Gemini summary' : 'Deterministic summary'}</span></div><div className="analysis-score"><strong>{analysis.readinessPercent}<span>%</span></strong><small>ROLE READINESS</small></div></section>
    <section className="analysis-columns">
      <article className="panel"><p className="eyebrow">MATCHED SKILLS</p><h3>What you bring</h3>{analysis.proficientSkills.length ? <ul className="analysis-skill-list">{analysis.proficientSkills.map((skill) => <li key={skill}><span>{skill}</span><b>{'★'}</b></li>)}</ul> : <p className="panel-intro">No skills are rated proficient yet. Your ratings remain saved for this profile.</p>}</article>
      <article className="panel"><p className="eyebrow">SKILL GAPS</p><h3>Where to focus</h3>{analysis.skillGaps.length ? <ul className="analysis-skill-list">{analysis.skillGaps.map((skill) => <li key={skill}><span>{skill}</span><b className={analysis.criticalSkills.includes(skill) ? 'priority-badge critical' : 'priority-badge'}>{analysis.criticalSkills.includes(skill) ? 'Critical' : 'Focus'}</b></li>)}</ul> : <p className="panel-intro">No skill gaps were identified from these ratings.</p>}</article>
    </section>
    <section className="panel analysis-role-matches"><div className="panel-heading"><div><p className="eyebrow">ROLE COMPARISON</p><h3>How your profile aligns</h3></div><span className="match-note">Based on saved self-ratings</span></div>{analysis.roleMatches.map((match) => <div className="analysis-match" key={match.title}><span>{match.title}</span><div className="match-meter" role="meter" aria-label={`${match.title} readiness`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={match.readinessPercent}><i style={{ width: `${match.readinessPercent}%` }} /></div><strong>{match.readinessPercent}%</strong></div>)}</section>
    <section className="panel analysis-actions"><div><p className="eyebrow">RECOMMENDED ACTIONS</p><h3>Start with these steps</h3></div><ol>{analysis.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol></section>
  </div>;
}

function Overview({ account, average, hasAssessment, matches, scores, tasks, weakest, analysis, onAssess, onAnalysis, onAddTask, onGoRoadmap }: { account: Account; average: number | null; hasAssessment: boolean; matches: { title: string; score: number }[]; scores: SkillScores; tasks: RoadmapTask[]; weakest: string[]; analysis: SkillAnalysis | null; onAssess: () => void; onAnalysis: () => void; onAddTask: (title: string, skill: string) => void; onGoRoadmap: () => void }) {
  const role = account.role.toUpperCase();
  if (role === 'RECRUITER') {
    return <RecruiterOverview account={account} matches={matches} tasks={tasks} weakest={weakest} onGoRoadmap={onGoRoadmap} />;
  }

  const assessed = hasAssessment;
  const completed = tasks.filter((task) => task.completed).length;
  const strongestSkill = assessed ? [...skills].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0] ?? 'Career readiness' : 'Not assessed';
  const momentum = tasks.length === 0 ? null : Math.round((completed / tasks.length) * 100);
  const topFocus = weakest.slice(0, 3);
  const topMatch = matches[0];

  return <>
    <section className="hero-panel">
      <div>
        <p className="eyebrow light">YOUR STARTING POINT</p>
        <h2>Good to see you, <em>{account.fullName.split(' ')[0]}.</em></h2>
        <p className="hero-copy">{assessed ? 'Your latest self-assessment is shaping a clearer route to your next role.' : 'Rate your current skills to uncover your best-fit roles and build a focused plan.'}</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onAssess} type="button">{assessed ? 'Update assessment' : 'Start assessment'}<span>→</span></button>
          <button className="secondary-button" onClick={onGoRoadmap} type="button">Open roadmap</button>
        </div>
      </div>
      <div className="score-ring"><strong>{average ?? '—'}{average !== null && <span>%</span>}</strong><small>SKILL READINESS</small></div>
    </section>

    <div className="metrics-grid">
      <Metric icon="◎" tone="mint" label="SKILL READINESS" value={average === null ? '—' : `${average}%`} detail={assessed ? `${skills.length} skills rated` : 'Assessment needed'} />
      <Metric icon="↗" tone="amber" label="TOP ROLE MATCH" value={topMatch ? `${topMatch.score}%` : '—'} detail={topMatch?.title ?? (assessed ? 'Analysis unavailable' : 'Rate skills to compare')} />
      <Metric icon="✓" tone="coral" label="ROADMAP PROGRESS" value={`${completed}/${tasks.length || 0}`} detail="Learning tasks completed" />
      <Metric icon="⚡" tone="blue" label="MOMENTUM" value={momentum === null ? '—' : `${momentum}%`} detail={momentum === null ? 'Add tasks to track completion' : 'Task completion rate'} />
    </div>

    <section className="insight-grid">
      <article className="panel insight-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CAREER PULSE</p>
            <h4>Growth momentum</h4>
          </div>
          <span className="chip">Saved profile</span>
        </div>
        <div className="insight-metrics">
          <div className="mini-stat">
            <span>Strongest skill</span>
            <strong>{strongestSkill}</strong>
            <small>{assessed ? `${scores[strongestSkill] ?? 0}/5 confidence` : 'Complete an assessment'}</small>
          </div>
          <div className="mini-stat">
            <span>Top role fit</span>
            <strong>{topMatch?.title ?? (assessed ? 'Analysis unavailable' : 'Undecided')}</strong>
            <small>{topMatch ? `${topMatch.score}% fit` : (assessed ? 'Retry the skill analysis' : 'Need assessment')}</small>
          </div>
        </div>
        {analysis && <p className="analysis-summary">{analysis.summary}</p>}
      </article>

      <article className="panel insight-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RECOMMENDED FOCUS</p>
            <h4>Priority focus</h4>
          </div>
          <button type="button" className="chip-button" onClick={onAnalysis}>View analysis</button>
        </div>
        <ul className="priority-list">
          {topFocus.length === 0 && <li className="priority-empty">Save an assessment to identify priority skills.</li>}
          {topFocus.map((skill, index) => (
            <li key={skill}>
              <span className="priority-index">0{index + 1}</span>
              <div>
                <strong>{skill}</strong>
                <small>Practice this area to raise your readiness score.</small>
              </div>
              <button type="button" onClick={() => onAddTask(`Complete a guided ${skill} practice exercise`, skill)} aria-label={`Add practice task for ${skill}`}>+</button>
            </li>
          ))}
        </ul>
      </article>
    </section>

    <button type="button" className="analysis-preview" onClick={onAnalysis}><span><p className="eyebrow">SKILL GAP ANALYSIS</p><strong>{analysis ? `${analysis.targetRole} · ${analysis.readinessPercent}% role readiness` : assessed ? 'Analysis is not available yet' : 'No skill analysis completed yet'}</strong></span><span className="text-button">{analysis ? 'View full analysis' : assessed ? 'Try again' : 'Start assessment'} <b>→</b></span></button>

    <div className="section-heading"><div><p className="eyebrow">YOUR NEXT STEPS</p><h3>Build momentum</h3></div><button type="button" className="text-button" onClick={onGoRoadmap}>Open roadmap <span>→</span></button></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h4>Skill snapshot</h4><p>Self-rating out of 5</p></div><span className="dots">•••</span></div>{skills.map((skill) => <div className="skill-row" key={skill}><span className="skill-name"><i className="skill-dot coral-dot" />{skill}</span><div className="bar"><i style={{ width: `${(scores[skill] ?? 0) * 20}%` }} /></div><strong>{scores[skill] ?? 0}/5</strong></div>)}<button className="text-button" type="button" onClick={onAssess}>Rate your skills <span>→</span></button></section>
      <section className="panel"><div className="panel-heading"><div><h4>Role matches</h4><p>Weighted fit from your saved analysis</p></div></div>{matches.length ? matches.map((match, index) => <div className="match-row" key={match.title}><div><span className={`match-rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><strong>{match.title}</strong></div><div className="match-meter"><i style={{ width: `${match.score}%` }} /></div><b>{match.score}%</b><button type="button" title={`Add a ${match.title} learning task`} onClick={() => onAddTask(`Explore a practical ${match.title} project`, weakest[0] ?? 'Career exploration')}>+</button></div>) : <p className="panel-intro">{assessed ? 'Role comparisons are unavailable. Open the skill analysis to retry.' : 'Complete an assessment to compare your profile with supported roles.'}</p>}{matches.length > 0 && <p className="match-disclaimer">Indicative matches based on your self-ratings, not a hiring guarantee.</p>}</section></div>
    <section className="roadmap-preview"><div><p className="eyebrow">FOCUS SKILLS</p><h3>Your highest-impact gaps</h3></div><div className="focus-skills">{weakest.length ? weakest.map((skill) => <span key={skill}>{skill}<b>{scores[skill] ?? 0}/5</b></span>) : <p>Complete an assessment to identify skill gaps.</p>}</div><button className="primary-button" type="button" onClick={onGoRoadmap}>Build my plan <span>→</span></button></section>
  </>;
}

function RecruiterOverview({ account, matches, tasks, weakest, onGoRoadmap }: { account: Account; matches: { title: string; score: number }[]; tasks: RoadmapTask[]; weakest: string[]; onGoRoadmap: () => void }) {
  const completed = tasks.filter((task) => task.completed).length;
  const topMatch = matches[0];

  return <>
    <section className="hero-panel recruiter-hero">
      <div>
        <p className="eyebrow light">RECRUITER WORKSPACE</p>
        <h2>Welcome, <em>{account.fullName.split(' ')[0]}.</em></h2>
        <p className="hero-copy">Candidate pipeline data is not connected to this project yet. Your own role-fit and learning progress below come from your saved account data.</p>
        <div className="hero-actions"><button className="primary-button" type="button" onClick={onGoRoadmap}>Open my roadmap <span>→</span></button></div>
      </div>
      <div className="score-ring recruiter-ring"><strong>{tasks.length ? Math.round(completed / tasks.length * 100) : 0}<span>%</span></strong><small>MY ROADMAP</small></div>
    </section>
    <div className="metrics-grid">
      <Metric icon="◎" tone="mint" label="CANDIDATE PIPELINE" value="Not connected" detail="No candidate records are available" />
      <Metric icon="↗" tone="amber" label="TOP PERSONAL MATCH" value={topMatch ? `${topMatch.score}%` : '—'} detail={topMatch?.title ?? 'Complete an assessment'} />
      <Metric icon="✓" tone="coral" label="MY ROADMAP" value={`${completed}/${tasks.length}`} detail="Completed learning tasks" />
      <Metric icon="⚡" tone="blue" label="MY SKILL GAPS" value={`${weakest.length}`} detail="From my saved assessment" />
    </div>
    <section className="panel recruiter-empty"><p className="eyebrow">CANDIDATE DATA</p><h4>No connected candidate pipeline</h4><p>Recruiter candidate profiles, applications, and hiring stages are not implemented. This view does not display sample candidate totals.</p></section>
  </>;
}



function Assessment({ scores, setScores, ratedSkills, setRatedSkills, targetRole, setTargetRole, onSave, busy }: { scores: SkillScores; setScores: (scores: SkillScores) => void; ratedSkills: Set<string>; setRatedSkills: (skills: Set<string>) => void; targetRole: string; setTargetRole: (role: string) => void; onSave: () => void; busy: boolean }) {
  function setRating(skill: string, score: number) {
    setScores({ ...scores, [skill]: score });
    setRatedSkills(new Set(ratedSkills).add(skill));
  }
  return <section className="panel assessment-panel"><div className="section-heading"><div><p className="eyebrow">SELF-ASSESSMENT</p><h3>How comfortable are you with each skill?</h3></div></div><p className="panel-intro">Rate each skill from 0 (new to it) to 5 (confident using it independently). Select a role to compare your saved profile against its supported skill weights.</p><label className="target-role-field"><span>Target career role</span><select value={targetRole} onChange={(event) => setTargetRole(event.target.value)}><option>Backend Developer</option><option>Data Analyst</option><option>Cloud Engineer</option></select></label><div className="assessment-progress"><div><span>Assessment completion</span><strong>{ratedSkills.size} of {skills.length}</strong></div><div className="progress-track" role="progressbar" aria-label="Assessment completion" aria-valuemin={0} aria-valuemax={skills.length} aria-valuenow={ratedSkills.size}><i style={{ width: `${ratedSkills.size / skills.length * 100}%` }} /></div></div><p className="rating-scale-note">0 New · 1 Beginner · 2 Developing · 3 Intermediate · 4 Advanced · 5 Confident</p><div className="assessment-list">{skills.map((skill) => <div className="assessment-skill" key={skill}><span><strong>{skill}</strong><small>{ratedSkills.has(skill) ? `${scores[skill]} · ${ratingLabels[scores[skill]]}` : 'Choose a rating'}</small></span><div className="rating-options" role="group" aria-label={`${skill} rating`}>{[0, 1, 2, 3, 4, 5].map((score) => <button type="button" aria-pressed={ratedSkills.has(skill) && scores[skill] === score} aria-label={`${skill}: ${score}, ${ratingLabels[score]}`} className={ratedSkills.has(skill) && scores[skill] === score ? 'rating active' : 'rating'} key={score} onClick={() => setRating(skill, score)}>{score}</button>)}</div></div>)}</div><div className="assessment-actions"><span>{ratedSkills.size === skills.length ? 'All skills rated' : `${skills.length - ratedSkills.size} ratings remaining`}</span><button type="button" className="primary-button" disabled={busy || ratedSkills.size !== skills.length} onClick={onSave}>{busy ? 'Saving…' : 'Save assessment'}<span>→</span></button></div></section>;
}

function Roadmap({ tasks, completed, weakest, onAddTask, onToggle, onGenerate, busy }: { tasks: RoadmapTask[]; completed: number; weakest: string[]; onAddTask: (title: string, skill: string) => void; onToggle: (task: RoadmapTask) => void; onGenerate: () => void; busy: boolean }) {
  const [newTitle, setNewTitle] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(weakest[0] ?? skills[0]);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'DONE'>('ALL');
  const [sortBy, setSortBy] = useState<'PRIORITY' | 'CREATED'>('PRIORITY');
  const visibleTasks = tasks
    .filter((task) => filter === 'ALL' || (filter === 'DONE' ? task.completed : !task.completed))
    .slice()
    .sort((left, right) => sortBy === 'PRIORITY' ? left.priority - right.priority : left.id - right.id);
  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask(newTitle.trim(), selectedSkill);
    setNewTitle('');
  }
  return <div className="roadmap-layout"><section className="panel roadmap-panel"><div className="section-heading"><div><p className="eyebrow">YOUR PLAN</p><h3>Small steps, real progress</h3></div><div className="roadmap-actions"><span className="progress-count">{completed}/{tasks.length} done</span><button type="button" className="secondary-action" disabled={busy} onClick={onGenerate}>{busy ? 'Building…' : 'Generate from gaps'}</button></div></div><form className="add-task-form" onSubmit={add}><input aria-label="New learning task" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Add a course, project, or practice goal" required maxLength={120} /><select aria-label="Skill area" value={selectedSkill} onChange={(event) => setSelectedSkill(event.target.value)}>{skills.map((skill) => <option key={skill}>{skill}</option>)}</select><button type="submit" className="primary-button">Add task <span>+</span></button></form>{tasks.length === 0 ? <div className="empty-state"><span>↗</span><h4>Your roadmap starts here</h4><p>Complete an assessment and generate a roadmap from your lowest-rated skills.</p></div> : <><div className="roadmap-controls"><label>Show<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="ALL">All tasks</option><option value="OPEN">Open</option><option value="DONE">Completed</option></select></label><label>Sort<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="PRIORITY">Priority</option><option value="CREATED">Added date</option></select></label></div>{visibleTasks.length ? <div className="task-list">{visibleTasks.map((task) => <div className={task.completed ? 'task-row completed' : 'task-row'} key={task.id}><input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} aria-label={`${task.completed ? 'Mark open' : 'Mark complete'}: ${task.title}`} /><span className="task-copy"><strong>{task.title}</strong><small>{task.skill} · Priority {task.priority} · {Math.round(task.estimatedMinutes / 60 * 10) / 10} estimated hours</small></span><span className="task-state">{task.completed ? 'DONE' : 'IN PROGRESS'}</span></div>)}</div> : <p className="panel-intro">No tasks match this filter.</p>}</>}</section><aside className="panel suggestion-panel"><p className="eyebrow">SUGGESTED FOCUS</p><h3>Practice your growth areas</h3><p>{weakest.length ? 'Choose an actionable step for each low-rated skill.' : 'Complete and save an assessment to see recommendations based on your skill gaps.'}</p>{weakest.map((skill) => <div className="suggestion" key={skill}><div><strong>{skill}</strong><small>Build confidence through practice</small></div><button type="button" title={`Add ${skill} practice task`} onClick={() => onAddTask(`Complete a guided ${skill} practice exercise`, skill)}>+</button></div>)}</aside></div>;
}

function ProgressTracker({ progress }: { progress: Progress }) {
  if (!progress.assessmentComplete) {
    return <section className="panel progress-empty"><h3>No skill analysis completed yet.</h3><p>Complete and save your assessment to start tracking learning progress.</p></section>;
  }
  return <section className="progress-view"><div className="metrics-grid"><Metric icon="✓" tone="mint" label="MODULES COMPLETED" value={`${progress.completedModules}/${progress.totalModules}`} detail="Saved roadmap tasks" /><Metric icon="↗" tone="amber" label="COMPLETION" value={`${progress.completionPercent}%`} detail="Based on completed tasks" /><Metric icon="◷" tone="blue" label="ESTIMATED TIME" value={`${progress.estimatedHoursCompleted}h`} detail="Estimated time for completed tasks" /></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">REMAINING FOCUS</p><h4>Skills with open roadmap tasks</h4></div></div>{progress.totalModules === 0 ? <p className="panel-intro">No roadmap tasks yet. Generate a plan from your saved assessment.</p> : progress.remainingSkills.length === 0 ? <p className="panel-intro">All roadmap tasks are complete. Nice work.</p> : <div className="focus-skills">{progress.remainingSkills.map((skill) => <span key={skill}>{skill}<b>OPEN</b></span>)}</div>}</section></section>;
}

function InterviewPrep({ questions, targetRole, feedback, onEvaluate }: { questions: InterviewQuestion[]; targetRole: string; feedback: InterviewFeedback | null; onEvaluate: (answer: string) => Promise<InterviewFeedback> }) {
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState('ALL');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<InterviewFeedback | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const categories = [...new Set(questions.map((item) => item.category))];
  const visibleQuestions = category === 'ALL' ? questions : questions.filter((item) => item.category === category);
  const question = visibleQuestions[index];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const evaluation = await onEvaluate(answer);
      setResult(evaluation);
      setScores((current) => [...current, evaluation.practiceScore]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not evaluate this practice answer.');
    } finally {
      setSubmitting(false);
    }
  }

  if (questions.length === 0) return <section className="panel progress-empty"><h3>Interview practice is not ready yet.</h3><p>Complete a skill assessment so questions can be matched to your target role and skill gaps.</p></section>;
  if (index >= visibleQuestions.length) {
    const practiceScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    return <section className="panel interview-result"><p className="eyebrow">PRACTICE SUMMARY</p><h3>{targetRole} interview practice complete</h3><p className="practice-score-label">Rule-based practice score</p><div className="interview-score">{practiceScore}<span>/100</span></div><p>This score reflects answer detail and example use. It is not AI-generated or an interview-readiness assessment.</p><button type="button" className="primary-button" onClick={() => { setIndex(0); setScores([]); setAnswer(''); setResult(null); }}>Practice again <span>↻</span></button></section>;
  }

  return <section className="panel interview-panel"><p className="eyebrow">MOCK INTERVIEW · {targetRole}</p><div className="interview-filters"><label>Question category<select value={category} onChange={(event) => { setCategory(event.target.value); setIndex(0); setScores([]); setAnswer(''); setResult(null); }}><option value="ALL">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="interview-meta"><span>{question.category}</span><span>{question.difficulty}</span><span>Focus: {question.skill}</span><span>Question {index + 1} of {visibleQuestions.length}</span></div><h3>{question.prompt}</h3><form onSubmit={submit}><label htmlFor="interview-answer">Your answer</label><textarea id="interview-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={5000} rows={7} required placeholder="Explain your approach and include an example where possible." /><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Reviewing…' : 'Submit answer'} <span>→</span></button></form>{error && <p className="form-error" role="alert">{error}</p>}{result && feedback && <div className="interview-feedback"><strong>Rule-based practice feedback · {result.practiceScore}/100</strong><p>{result.feedback}</p><button type="button" className="text-button" onClick={() => { setIndex((current) => current + 1); setAnswer(''); setResult(null); }}>Next question <span>→</span></button></div>}</section>;
}

function Metric({ icon, tone, label, value, detail }: { icon: string; tone: string; label: string; value: string; detail: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <button type="button" aria-current={active ? 'page' : undefined} className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><span aria-hidden="true">{icon}</span><span className="nav-label">{label}</span></button>; }
function Brand() { return <div className="brand-mark"><span>SG</span><strong>skillgap<span>.ai</span></strong></div>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }

declare global {
  interface Window {
    skillgapRoot?: ReturnType<typeof createRoot>;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('App root element is missing.');
window.skillgapRoot ??= createRoot(rootElement);
window.skillgapRoot.render(<StrictMode><App /></StrictMode>);
