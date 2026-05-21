// ─── State ──────────────────────────────────────────────────
const state = {
  repos: JSON.parse(localStorage.getItem('tactions_repos') || '[]'),
  activeRepo: null,
  currentView: 'welcome',
  currentRuns: [],
  currentRun: null,
  currentJobs: [],
  currentLogs: '',
};

// ─── Helpers ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let invoke;
let dom;

// ─── Init ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Tauri API - try different paths for v2
  try {
    if (window.__TAURI__ && window.__TAURI__.core) {
      invoke = window.__TAURI__.core.invoke;
    } else if (window.__TAURI__) {
      invoke = window.__TAURI__.invoke;
    }
  } catch (e) {
    console.error('Failed to get Tauri API:', e);
  }

  // Fallback if invoke not found
  if (!invoke) {
    console.warn('Tauri invoke not available, using mock');
    invoke = async (cmd, args) => {
      console.log('Mock invoke:', cmd, args);
      return null;
    };
  }

  // Cache DOM elements
  dom = {
    repoList: $('#repo-list'),
    emptyRepos: $('#empty-repos'),
    welcomeScreen: $('#welcome-screen'),
    runsView: $('#runs-view'),
    jobView: $('#job-view'),
    logView: $('#log-view'),
    runsList: $('#runs-list'),
    jobsList: $('#jobs-list'),
    logContent: $('#log-content code'),
    modalOverlay: $('#modal-overlay'),
    inputRepo: $('#input-repo'),
    checkPrivate: $('#check-private'),
    authStatus: $('#auth-status'),
    repoStatus: $('#repo-status'),
    btnConfirmAdd: $('#btn-confirm-add'),
    loadingOverlay: $('#loading-overlay'),
    loadingText: $('#loading-text'),
  };

  setupTitlebar();
  setupEventListeners();
  renderRepoList();
});

// ─── Titlebar ───────────────────────────────────────────────
function setupTitlebar() {
  try {
    let appWindow = null;

    // Tauri v2 API paths
    if (window.__TAURI__) {
      if (window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow) {
        appWindow = window.__TAURI__.window.getCurrentWindow();
      } else if (window.__TAURI__.window && window.__TAURI__.window.Window) {
        appWindow = window.__TAURI__.window.Window.getCurrent();
      } else if (window.__TAURI__.webviewWindow) {
        appWindow = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
      }
    }

    if (appWindow) {
      console.log('Tauri window API found');
      $('#btn-minimize').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        appWindow.minimize();
      });
      $('#btn-maximize').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maximized = await appWindow.isMaximized();
        maximized ? appWindow.unmaximize() : appWindow.maximize();
      });
      $('#btn-close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        appWindow.close();
      });
    } else {
      console.warn('Tauri window API not found. Available keys:', window.__TAURI__ ? Object.keys(window.__TAURI__) : 'none');
    }
  } catch (e) {
    console.error('Titlebar setup failed:', e);
  }
}

// ─── Event Listeners ────────────────────────────────────────
function setupEventListeners() {
  // Add repo modal
  $('#btn-add-repo').addEventListener('click', openAddRepoModal);
  $('#btn-close-modal').addEventListener('click', closeAddRepoModal);
  $('#btn-cancel-add').addEventListener('click', closeAddRepoModal);
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeAddRepoModal();
  });

  // Private checkbox
  dom.checkPrivate.addEventListener('change', onPrivateToggle);

  // Confirm add
  dom.btnConfirmAdd.addEventListener('click', onConfirmAddRepo);

  // Input change
  dom.inputRepo.addEventListener('input', () => {
    hideAllStatus();
    // Enable button if it looks like owner/repo
    const val = dom.inputRepo.value.trim();
    dom.btnConfirmAdd.disabled = !val.includes('/') || val.split('/').length < 2 || val.split('/')[1] === '';
    // Clear previously cached repoInfo on new input
    dom.btnConfirmAdd._repoInfo = null;
  });

  // Input enter key
  dom.inputRepo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onConfirmAddRepo();
  });

  // Refresh
  $('#btn-refresh-runs')?.addEventListener('click', () => {
    if (state.activeRepo) loadWorkflowRuns(state.activeRepo);
  });

  // Back buttons
  $('#btn-back-to-runs')?.addEventListener('click', () => showView('runs'));
  $('#btn-back-to-jobs')?.addEventListener('click', () => showView('jobs'));

  // Errors only toggle
  $('#toggle-errors-only')?.addEventListener('change', filterLogs);
}

// ─── Repo List Rendering ───────────────────────────────────
function renderRepoList() {
  const existing = dom.repoList.querySelectorAll('.repo-item');
  existing.forEach((el) => el.remove());

  if (state.repos.length === 0) {
    dom.emptyRepos.classList.remove('hidden');
    return;
  }

  dom.emptyRepos.classList.add('hidden');

  state.repos.forEach((repo) => {
    const item = document.createElement('div');
    item.className = `repo-item${state.activeRepo === repo.full_name ? ' active' : ''}`;
    item.innerHTML = `
      <div class="repo-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
        </svg>
      </div>
      <div class="repo-info">
        <div class="repo-name">${repo.full_name.split('/')[1]}${repo.private ? '<span class="repo-badge">private</span>' : ''}</div>
        <div class="repo-owner">${repo.full_name.split('/')[0]}</div>
      </div>
      <button class="repo-remove" data-repo="${repo.full_name}" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.repo-remove')) return;
      selectRepo(repo.full_name);
    });

    item.querySelector('.repo-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeRepo(repo.full_name);
    });

    dom.repoList.appendChild(item);
  });
}

function saveRepos() {
  localStorage.setItem('tactions_repos', JSON.stringify(state.repos));
}

function removeRepo(fullName) {
  state.repos = state.repos.filter((r) => r.full_name !== fullName);
  saveRepos();
  if (state.activeRepo === fullName) {
    state.activeRepo = null;
    showView('welcome');
  }
  renderRepoList();
}

// ─── Add Repo Modal ────────────────────────────────────────
function openAddRepoModal() {
  dom.modalOverlay.classList.remove('hidden');
  dom.inputRepo.value = '';
  dom.checkPrivate.checked = false;
  dom.btnConfirmAdd.disabled = true;
  hideAllStatus();
  setTimeout(() => dom.inputRepo.focus(), 100);
}

function closeAddRepoModal() {
  dom.modalOverlay.classList.add('hidden');
}

function hideAllStatus() {
  dom.authStatus.classList.add('hidden');
  dom.repoStatus.classList.add('hidden');
  $$('#auth-checking, #auth-ok, #auth-fail').forEach((el) => el.classList.add('hidden'));
  $$('#repo-checking, #repo-ok, #repo-fail, #repo-no-actions').forEach((el) => el.classList.add('hidden'));
}

// ─── Private Toggle → Auth Check ───────────────────────────
async function onPrivateToggle() {
  if (dom.checkPrivate.checked) {
    dom.authStatus.classList.remove('hidden');
    $('#auth-checking').classList.remove('hidden');
    $('#auth-ok').classList.add('hidden');
    $('#auth-fail').classList.add('hidden');

    try {
      const authResult = await invoke('check_gh_auth');
      $('#auth-checking').classList.add('hidden');

      if (authResult && authResult.logged_in) {
        $('#auth-ok').classList.remove('hidden');
        const txt = authResult.username
          ? `Authenticated as ${authResult.username}`
          : 'Authenticated';
        $('#auth-ok-text').textContent = txt;
      } else {
        $('#auth-fail').classList.remove('hidden');
        dom.btnConfirmAdd.disabled = true;
      }
    } catch (err) {
      $('#auth-checking').classList.add('hidden');
      $('#auth-fail').classList.remove('hidden');
      dom.btnConfirmAdd.disabled = true;
    }
  } else {
    dom.authStatus.classList.add('hidden');
  }
}

// ─── Validate & Prepare ────────────────────────────────────
async function validateAndPrepare() {
  const repoInput = dom.inputRepo.value.trim();
  if (!repoInput || !repoInput.includes('/')) return;

  // Check if already added
  if (state.repos.some((r) => r.full_name.toLowerCase() === repoInput.toLowerCase())) {
    showRepoError('Repository is already added.');
    return;
  }

  dom.repoStatus.classList.remove('hidden');
  $('#repo-checking').classList.remove('hidden');
  $('#repo-ok').classList.add('hidden');
  $('#repo-fail').classList.add('hidden');
  $('#repo-no-actions').classList.add('hidden');

  try {
    const repoInfo = await invoke('check_repo', { repo: repoInput });
    $('#repo-checking').classList.add('hidden');

    if (!repoInfo.has_actions) {
      $('#repo-no-actions').classList.remove('hidden');
      dom.btnConfirmAdd.disabled = false;
      dom.btnConfirmAdd._repoInfo = repoInfo;
    } else {
      $('#repo-ok').classList.remove('hidden');
      $('#repo-ok-text').textContent = `Repository found — ${repoInfo.default_branch} branch`;
      dom.btnConfirmAdd.disabled = false;
      dom.btnConfirmAdd._repoInfo = repoInfo;
    }
  } catch (err) {
    $('#repo-checking').classList.add('hidden');
    showRepoError(typeof err === 'string' ? err : err.message || 'Repository not found');
  }
}

function showRepoError(msg) {
  dom.repoStatus.classList.remove('hidden');
  $('#repo-fail').classList.remove('hidden');
  $('#repo-fail-text').textContent = msg;
  dom.btnConfirmAdd.disabled = true;
}

// ─── Confirm Add ────────────────────────────────────────────
async function onConfirmAddRepo() {
  let repoInfo = dom.btnConfirmAdd._repoInfo;
  if (!repoInfo) {
    await validateAndPrepare();
    repoInfo = dom.btnConfirmAdd._repoInfo;
    if (!repoInfo) return; // Validation failed, error is shown
  }

  state.repos.push({
    full_name: repoInfo.full_name,
    private: repoInfo.private,
    description: repoInfo.description,
    default_branch: repoInfo.default_branch,
  });

  saveRepos();
  renderRepoList();
  closeAddRepoModal();
  selectRepo(repoInfo.full_name);
}

// ─── Select Repo ────────────────────────────────────────────
async function selectRepo(fullName) {
  state.activeRepo = fullName;
  renderRepoList();
  await loadWorkflowRuns(fullName);
}

// ─── Load Workflow Runs ─────────────────────────────────────
async function loadWorkflowRuns(fullName) {
  showLoading('Loading workflow runs...');
  showView('runs');

  const repo = state.repos.find((r) => r.full_name === fullName);
  $('#runs-repo-name').textContent = fullName;
  $('#runs-repo-desc').textContent = repo?.description || '';

  try {
    const runs = await invoke('get_workflow_runs', { repo: fullName, limit: 30 });
    state.currentRuns = runs;
    renderRuns(runs);
  } catch (err) {
    dom.runsList.innerHTML = `<div class="empty-state"><p style="color:var(--error)">${escapeHtml(String(err))}</p></div>`;
  } finally {
    hideLoading();
  }
}

function renderRuns(runs) {
  if (runs.length === 0) {
    dom.runsList.innerHTML = '<div class="empty-state"><p>No workflow runs found</p></div>';
    return;
  }

  dom.runsList.innerHTML = runs.map((run) => {
    const conclusion = run.conclusion || run.status;
    const timeAgo = getTimeAgo(run.created_at);
    return `
      <div class="run-item" data-run-id="${run.id}">
        <div class="run-status-icon">
          <div class="status-dot ${conclusion}"></div>
        </div>
        <div class="run-info">
          <div class="run-name">${escapeHtml(run.name)}</div>
          <div class="run-meta">
            <span>${escapeHtml(run.event)}</span>
            <span>${escapeHtml(run.head_sha)}</span>
          </div>
        </div>
        <div class="run-branch">${escapeHtml(run.head_branch)}</div>
        <div class="run-time">${timeAgo}</div>
        <div class="run-number">#${run.run_number}</div>
      </div>
    `;
  }).join('');

  dom.runsList.querySelectorAll('.run-item').forEach((el) => {
    el.addEventListener('click', () => {
      const runId = parseInt(el.dataset.runId);
      const run = state.currentRuns.find((r) => r.id === runId);
      if (run) loadRunJobs(run);
    });
  });
}

// ─── Load Run Jobs ──────────────────────────────────────────
async function loadRunJobs(run) {
  state.currentRun = run;
  showLoading('Loading jobs...');
  showView('jobs');

  $('#job-run-name').textContent = run.name;
  $('#job-run-info').textContent = `#${run.run_number} · ${run.head_branch} · ${run.head_sha}`;

  try {
    const jobs = await invoke('get_run_jobs', { repo: state.activeRepo, runId: run.id });
    state.currentJobs = jobs;
    renderJobs(jobs);
  } catch (err) {
    dom.jobsList.innerHTML = `<div class="empty-state"><p style="color:var(--error)">${escapeHtml(String(err))}</p></div>`;
  } finally {
    hideLoading();
  }
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    dom.jobsList.innerHTML = '<div class="empty-state"><p>No jobs found</p></div>';
    return;
  }

  dom.jobsList.innerHTML = jobs.map((job) => {
    const conclusion = job.conclusion || job.status || '';
    const stepsHtml = (job.steps || []).map((step) => {
      const stepConclusion = step.conclusion || step.status || '';
      const icon = getStepIcon(stepConclusion);
      return `
        <div class="step-item ${stepConclusion}">
          <div class="step-icon ${stepConclusion}">${icon}</div>
          <span class="step-name">${escapeHtml(step.name)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="job-item">
        <div class="job-header" data-job-id="${job.id}">
          <div class="status-dot ${conclusion}"></div>
          <span class="job-name">${escapeHtml(job.name)}</span>
          <span class="job-conclusion ${conclusion}">${conclusion || 'pending'}</span>
          <div class="job-actions">
            <button class="btn-logs" data-job-id="${job.id}" data-job-name="${escapeHtml(job.name)}">View Logs</button>
          </div>
        </div>
        <div class="job-steps">${stepsHtml}</div>
      </div>
    `;
  }).join('');

  dom.jobsList.querySelectorAll('.btn-logs').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const jobId = parseInt(btn.dataset.jobId);
      const jobName = btn.dataset.jobName;
      loadJobLogs(jobId, jobName);
    });
  });
}

function getStepIcon(conclusion) {
  switch (conclusion) {
    case 'success':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    case 'failure':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    case 'skipped':
    case 'cancelled':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    default:
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  }
}

// ─── Load Job Logs ──────────────────────────────────────────
async function loadJobLogs(jobId, jobName) {
  showLoading('Loading logs...');
  showView('logs');

  $('#log-job-name').textContent = jobName;
  $('#toggle-errors-only').checked = false;

  try {
    const logs = await invoke('get_job_logs', { repo: state.activeRepo, jobId });
    state.currentLogs = logs;
    renderLogs(logs);
  } catch (err) {
    dom.logContent.innerHTML = `<span style="color:var(--error)">${escapeHtml(String(err))}</span>`;
  } finally {
    hideLoading();
  }
}

function renderLogs(logs) {
  const lines = logs.split('\n');
  const errorPatterns = /error|Error|ERROR|fail|Fail|FAIL|panic|PANIC|fatal|FATAL|exception|Exception/;

  dom.logContent.innerHTML = lines.map((line) => {
    const isError = errorPatterns.test(line);
    const cls = isError ? 'log-line error-line' : 'log-line';
    return `<span class="${cls}" data-is-error="${isError}">${escapeHtml(line)}</span>`;
  }).join('\n');
}

function filterLogs() {
  const errorsOnly = $('#toggle-errors-only').checked;
  const lines = dom.logContent.querySelectorAll('.log-line');
  lines.forEach((line) => {
    if (errorsOnly) {
      line.style.display = line.dataset.isError === 'true' ? '' : 'none';
    } else {
      line.style.display = '';
    }
  });
}

// ─── View Management ────────────────────────────────────────
function showView(view) {
  state.currentView = view;
  dom.welcomeScreen.classList.add('hidden');
  dom.runsView.classList.add('hidden');
  dom.jobView.classList.add('hidden');
  dom.logView.classList.add('hidden');

  switch (view) {
    case 'welcome': dom.welcomeScreen.classList.remove('hidden'); break;
    case 'runs': dom.runsView.classList.remove('hidden'); break;
    case 'jobs': dom.jobView.classList.remove('hidden'); break;
    case 'logs': dom.logView.classList.remove('hidden'); break;
  }
}

// ─── Loading ────────────────────────────────────────────────
function showLoading(text = 'Loading...') {
  dom.loadingText.textContent = text;
  dom.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  dom.loadingOverlay.classList.add('hidden');
}

// ─── Utilities ──────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
