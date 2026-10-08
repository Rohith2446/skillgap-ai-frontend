import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Account, type InterviewFeedback, type InterviewQuestion, type Progress, type RoadmapTask, type SkillAnalysis, type SkillScores } from './services/api';
import './styles.css';

type AuthMode = 'login' | 'register';
type Credentials = { email: string; password: string };
type View = 'overview' | 'assessment' | 'roadmap' | 'progress' | 'interview';

const skills = ['Java', 'SQL', 'Communication', 'Problem solving', 'Data analysis', 'Cloud fundamentals'];
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
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [interviewFeedback, setInterviewFeedback] = useState<InterviewFeedback | null>(null);
  const [view, setView] = useState<View>('overview');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.removeItem('skillgap.credentials');
  }, []);

  useEffect(() => {
    if (!credentials) return;
    let active = true;
    Promise.all([api.me(credentials), api.getScores(credentials), api.getRoadmap(credentials), api.getTargetRole(credentials), api.getProgress(credentials)])
      .then(([user, savedScores, savedTasks, savedRole, savedProgress]) => {
        if (!active) return;
        const nextScores = { ...blankScores, ...Object.fromEntries(savedScores.map(({ skill, rating }) => [skill, rating])) };
        setAccount(user);
        setScores(nextScores);
        setRatedSkills(new Set(savedScores.map(({ skill }) => skill)));
        setTasks(savedTasks);
        setProgress(savedProgress);
        setTargetRole(savedRole.targetRole);
        if (savedScores.length > 0) {
          api.analyzeSkills(credentials).then((savedAnalysis) => {
            if (active) setAnalysis(savedAnalysis);
          }).catch(() => setAnalysis(null));
        } else {
          setAnalysis(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setCredentials(null);
        setAccount(null);
        setNotice('Could not reach the backend or restore this session. Check the connection and sign in again.');
      });
    return () => { active = false; };
  }, [credentials]);

  async function authenticate(mode: AuthMode, data: { fullName: string; email: string; password: string; role: string }) {
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'register') await api.register(data);
      const nextCredentials = { email: data.email, password: data.password };
      const user = await api.me(nextCredentials);
      setCredentials(nextCredentials);
      setAccount(user);
      setTargetRole('Backend Developer');
      setAnalysis(null);
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
      const savedAnalysis = await api.analyzeSkills(credentials);
      setAnalysis(savedAnalysis);
      setRatedSkills(new Set(skills));
      setProgress(await api.getProgress(credentials));
      setNotice('Assessment saved. Your role-fit scores are up to date.');
      setView('overview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save assessment.');
    } finally {
      setBusy(false);
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
    try {
      setInterviewQuestions(await api.getInterviewQuestions(credentials));
      setView('interview');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load interview questions.');
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
    return <AuthScreen onAuthenticate={authenticate} notice={notice} busy={busy} />;
  }

  const hasAssessment = ratedSkills.size === skills.length;
  const average = hasAssessment ? Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) / skills.length * 20) : null;
  const matches = analysis?.roleMatches.map(({ title, readinessPercent }) => ({ title, score: readinessPercent })) ?? [];
  const weakest = hasAssessment ? [...skills].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0)).slice(0, 3) : [];
  const completedTasks = tasks.filter((task) => task.completed).length;
  const pageTitles: Record<View, string> = { overview: 'Your career overview', assessment: 'Skill assessment', roadmap: 'Your learning roadmap', progress: 'Progress tracker', interview: 'Interview preparation' };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="eyebrow">WORKSPACE</p>
        <nav className="nav-list" aria-label="Main navigation">
          <NavButton active={view === 'overview'} icon="◫" label="Overview" onClick={() => { setView('overview'); setNotice(''); }} />
          <NavButton active={view === 'assessment'} icon="◎" label="Skill assessment" onClick={() => { setView('assessment'); setNotice(''); }} />
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
          <div className="top-actions"><span className="status-pill"><i /> Progress saved</span><span className="avatar small">{initials(account.fullName)}</span></div>
        </header>
        {notice && <div className="notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

        {view === 'overview' && <Overview account={account} average={average} hasAssessment={hasAssessment} matches={matches} scores={scores} tasks={tasks} weakest={weakest} analysis={analysis} onAssess={() => setView('assessment')} onAddTask={addTask} onGoRoadmap={() => setView('roadmap')} />}
        {view === 'assessment' && <Assessment scores={scores} setScores={setScores} ratedSkills={ratedSkills} setRatedSkills={setRatedSkills} targetRole={targetRole} setTargetRole={setTargetRole} onSave={saveAssessment} busy={busy} />}
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
          <div className="visual-copy"><p className="eyebrow auth-eyebrow">CAREER INTELLIGENCE</p><h1>Build a career that fits your strengths.</h1><p>See where you stand, discover roles that fit, and turn skill gaps into a practical plan.</p></div>
          <div className="benefits-list"><div><strong>6</strong><span>core skills mapped</span></div><div><strong>3</strong><span>career pathways</span></div><div><strong>1</strong><span>personal roadmap</span></div></div>
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

function Overview({ account, average, hasAssessment, matches, scores, tasks, weakest, analysis, onAssess, onAddTask, onGoRoadmap }: { account: Account; average: number | null; hasAssessment: boolean; matches: { title: string; score: number }[]; scores: SkillScores; tasks: RoadmapTask[]; weakest: string[]; analysis: SkillAnalysis | null; onAssess: () => void; onAddTask: (title: string, skill: string) => void; onGoRoadmap: () => void }) {
  const role = account.role.toUpperCase();
  if (role === 'RECRUITER') {
    return <RecruiterOverview account={account} matches={matches} tasks={tasks} weakest={weakest} onGoRoadmap={onGoRoadmap} />;
  }

  const assessed = hasAssessment;
  const completed = tasks.filter((task) => task.completed).length;
  const strongestSkill = assessed ? [...skills].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0] ?? 'Career readiness' : 'Not assessed';
  const momentum = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
  const topFocus = weakest.slice(0, 3);

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
      <Metric icon="◎" tone="mint" label="SKILL READINESS" value={average === null ? '—' : `${average}%`} detail={assessed ? `${Object.values(scores).filter((score) => score > 0).length} skills rated` : 'Assessment needed'} />
      <Metric icon="↗" tone="amber" label="TOP ROLE MATCH" value={assessed ? `${matches[0].score}%` : '—'} detail={assessed ? matches[0].title : 'Rate skills to compare'} />
      <Metric icon="✓" tone="coral" label="ROADMAP PROGRESS" value={`${completed}/${tasks.length || 0}`} detail="Learning tasks completed" />
      <Metric icon="⚡" tone="blue" label="MOMENTUM" value={`${momentum}%`} detail="Task completion rate" />
    </div>

    <section className="insight-grid">
      <article className="panel insight-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CAREER PULSE</p>
            <h4>Growth momentum</h4>
          </div>
          <span className="chip">Live</span>
        </div>
        <div className="insight-metrics">
          <div className="mini-stat">
            <span>Strongest skill</span>
            <strong>{strongestSkill}</strong>
            <small>{assessed ? `${scores[strongestSkill] ?? 0}/5 confidence` : 'Complete an assessment'}</small>
          </div>
          <div className="mini-stat">
            <span>Top role fit</span>
            <strong>{assessed ? matches[0].title : 'Undecided'}</strong>
            <small>{assessed ? `${matches[0].score}% fit` : 'Need assessment'}</small>
          </div>
        </div>
        {analysis && <p className="analysis-summary">{analysis.summary}</p>}
      </article>

      <article className="panel insight-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">AI COACH</p>
            <h4>Priority focus</h4>
          </div>
          <button type="button" className="chip-button" onClick={onGoRoadmap}>Plan tasks</button>
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

    {analysis ? <section className="panel analysis-results"><div className="panel-heading"><div><p className="eyebrow">SKILL-GAP ANALYSIS</p><h4>{analysis.targetRole} readiness · {analysis.readinessPercent}%</h4></div><span className="analysis-source">{analysis.analysisMethod === 'GEMINI' ? 'Gemini generated' : 'Deterministic fallback'}</span></div><p className="analysis-summary">{analysis.summary}</p><div className="analysis-columns"><div><strong>Proficient</strong><p>{analysis.proficientSkills.length ? analysis.proficientSkills.join(', ') : 'No skills rated proficient yet.'}</p></div><div><strong>Skill gaps</strong><p>{analysis.skillGaps.length ? analysis.skillGaps.join(', ') : 'No current gaps from these ratings.'}</p></div><div><strong>Critical focus</strong><p>{analysis.criticalSkills.length ? analysis.criticalSkills.join(', ') : 'No critical gaps identified.'}</p></div></div><div className="analysis-next-steps"><strong>Recommended next steps</strong><ol>{analysis.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol></div></section> : !assessed && <section className="panel analysis-empty"><p className="eyebrow">SKILL-GAP ANALYSIS</p><h4>No skill analysis completed yet.</h4><p>Save an assessment to see your strengths, role readiness, and priority gaps.</p></section>}

    <div className="section-heading"><div><p className="eyebrow">YOUR NEXT STEPS</p><h3>Build momentum</h3></div><button type="button" className="text-button" onClick={onGoRoadmap}>Open roadmap <span>→</span></button></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h4>Skill snapshot</h4><p>Self-rating out of 5</p></div><span className="dots">•••</span></div>{skills.map((skill) => <div className="skill-row" key={skill}><span className="skill-name"><i className="skill-dot coral-dot" />{skill}</span><div className="bar"><i style={{ width: `${(scores[skill] ?? 0) * 20}%` }} /></div><strong>{scores[skill] ?? 0}/5</strong></div>)}<button className="text-button" type="button" onClick={onAssess}>Rate your skills <span>→</span></button></section>
      <section className="panel"><div className="panel-heading"><div><h4>Role matches</h4><p>Weighted fit from your skill profile</p></div><span className="dots">•••</span></div>{matches.map((match, index) => <div className="match-row" key={match.title}><div><span className={`match-rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><strong>{match.title}</strong></div><div className="match-meter"><i style={{ width: `${match.score}%` }} /></div><b>{match.score}%</b><button type="button" title={`Add a ${match.title} learning task`} onClick={() => onAddTask(`Explore a practical ${match.title} project`, weakest[0] ?? 'Career exploration')}>+</button></div>)}<p className="match-disclaimer">Indicative matches based on your self-ratings, not a hiring guarantee.</p></section></div>
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
  return <section className="panel assessment-panel"><div className="section-heading"><div><p className="eyebrow">SELF-ASSESSMENT</p><h3>How comfortable are you with each skill?</h3></div></div><p className="panel-intro">Rate yourself honestly from 0 (new to it) to 5 (confident using it independently). Your results are private to your account.</p><label className="target-role-field"><span>Target career role</span><select value={targetRole} onChange={(event) => setTargetRole(event.target.value)}><option>Backend Developer</option><option>Data Analyst</option><option>Cloud Engineer</option></select></label><div className="assessment-list">{skills.map((skill) => <label className="assessment-skill" key={skill}><span><strong>{skill}</strong><small>{ratedSkills.has(skill) ? `Level ${scores[skill]} of 5` : 'Select a rating'}</small></span><div className="rating-options" role="radiogroup" aria-label={`${skill} rating`}>{[0, 1, 2, 3, 4, 5].map((score) => <button type="button" role="radio" aria-checked={ratedSkills.has(skill) && scores[skill] === score} className={ratedSkills.has(skill) && scores[skill] === score ? 'rating active' : 'rating'} key={score} onClick={() => setRating(skill, score)}>{score}</button>)}</div></label>)}</div><div className="assessment-actions"><span>{ratedSkills.size} of {skills.length} skills rated</span><button type="button" className="primary-button" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save assessment'}<span>→</span></button></div></section>;
}

function Roadmap({ tasks, completed, weakest, onAddTask, onToggle, onGenerate, busy }: { tasks: RoadmapTask[]; completed: number; weakest: string[]; onAddTask: (title: string, skill: string) => void; onToggle: (task: RoadmapTask) => void; onGenerate: () => void; busy: boolean }) {
  const [newTitle, setNewTitle] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(weakest[0] ?? skills[0]);
  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask(newTitle.trim(), selectedSkill);
    setNewTitle('');
  }
  return <div className="roadmap-layout"><section className="panel roadmap-panel"><div className="section-heading"><div><p className="eyebrow">YOUR PLAN</p><h3>Small steps, real progress</h3></div><div className="roadmap-actions"><span className="progress-count">{completed}/{tasks.length} done</span><button type="button" className="secondary-action" disabled={busy} onClick={onGenerate}>{busy ? 'Building…' : 'Generate from gaps'}</button></div></div><form className="add-task-form" onSubmit={add}><input aria-label="New learning task" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Add a course, project, or practice goal" required maxLength={120} /><select aria-label="Skill area" value={selectedSkill} onChange={(event) => setSelectedSkill(event.target.value)}>{skills.map((skill) => <option key={skill}>{skill}</option>)}</select><button type="submit" className="primary-button">Add task <span>+</span></button></form>{tasks.length === 0 ? <div className="empty-state"><span>↗</span><h4>Your roadmap starts here</h4><p>Complete an assessment and generate a roadmap from your lowest-rated skills.</p></div> : <div className="task-list">{tasks.map((task) => <label className={task.completed ? 'task-row completed' : 'task-row'} key={task.id}><input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} /><span className="task-copy"><strong>{task.title}</strong><small>{task.skill} · Priority {task.priority} · {Math.round(task.estimatedMinutes / 60 * 10) / 10} estimated hours</small></span><span className="task-state">{task.completed ? 'DONE' : 'IN PROGRESS'}</span></label>)}</div>}</section><aside className="panel suggestion-panel"><p className="eyebrow">SUGGESTED FOCUS</p><h3>Practice your growth areas</h3><p>{weakest.length ? 'Choose an actionable step for each low-rated skill.' : 'Complete and save an assessment to see recommendations based on your skill gaps.'}</p>{weakest.map((skill) => <div className="suggestion" key={skill}><div><strong>{skill}</strong><small>Build confidence through practice</small></div><button type="button" title={`Add ${skill} practice task`} onClick={() => onAddTask(`Complete a guided ${skill} practice exercise`, skill)}>+</button></div>)}</aside></div>;
}

function ProgressTracker({ progress }: { progress: Progress }) {
  if (!progress.assessmentComplete) {
    return <section className="panel progress-empty"><h3>No skill analysis completed yet.</h3><p>Complete and save your assessment to start tracking learning progress.</p></section>;
  }
  return <section className="progress-view"><div className="metrics-grid"><Metric icon="✓" tone="mint" label="MODULES COMPLETED" value={`${progress.completedModules}/${progress.totalModules}`} detail="Saved roadmap tasks" /><Metric icon="↗" tone="amber" label="COMPLETION" value={`${progress.completionPercent}%`} detail="Based on completed tasks" /><Metric icon="◷" tone="blue" label="ESTIMATED TIME" value={`${progress.estimatedHoursCompleted}h`} detail="Estimated time for completed tasks" /></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">REMAINING FOCUS</p><h4>Skills with open roadmap tasks</h4></div></div>{progress.totalModules === 0 ? <p className="panel-intro">No roadmap tasks yet. Generate a plan from your saved assessment.</p> : progress.remainingSkills.length === 0 ? <p className="panel-intro">All roadmap tasks are complete. Nice work.</p> : <div className="focus-skills">{progress.remainingSkills.map((skill) => <span key={skill}>{skill}<b>OPEN</b></span>)}</div>}</section></section>;
}

function InterviewPrep({ questions, targetRole, feedback, onEvaluate }: { questions: InterviewQuestion[]; targetRole: string; feedback: InterviewFeedback | null; onEvaluate: (answer: string) => Promise<InterviewFeedback> }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<InterviewFeedback | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const question = questions[index];

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
  if (index >= questions.length) {
    const readiness = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    return <section className="panel interview-result"><p className="eyebrow">PRACTICE SUMMARY</p><h3>{targetRole} interview practice complete</h3><div className="interview-score">{readiness}<span>/100</span></div><p>This is a rule-based practice score based on answer detail and examples, not an AI hiring assessment.</p><button type="button" className="primary-button" onClick={() => { setIndex(0); setScores([]); setAnswer(''); setResult(null); }}>Practice again <span>↻</span></button></section>;
  }

  return <section className="panel interview-panel"><p className="eyebrow">MOCK INTERVIEW · {targetRole}</p><div className="interview-meta"><span>{question.category}</span><span>{question.difficulty}</span><span>Focus: {question.skill}</span><span>Question {index + 1} of {questions.length}</span></div><h3>{question.prompt}</h3><form onSubmit={submit}><label htmlFor="interview-answer">Your answer</label><textarea id="interview-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={5000} rows={7} required placeholder="Explain your approach and include an example where possible." /><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Reviewing…' : 'Submit answer'} <span>→</span></button></form>{error && <p className="form-error" role="alert">{error}</p>}{result && feedback && <div className="interview-feedback"><strong>Rule-based practice feedback · {result.practiceScore}/100</strong><p>{result.feedback}</p><button type="button" className="text-button" onClick={() => { setIndex((current) => current + 1); setAnswer(''); setResult(null); }}>Next question <span>→</span></button></div>}</section>;
}

function Metric({ icon, tone, label, value, detail }: { icon: string; tone: string; label: string; value: string; detail: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <button type="button" className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><span>{icon}</span>{label}</button>; }
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
