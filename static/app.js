/* Hockey Pool 2026 — app.js */

// ── Global State ────────────────────────────────────────────
let appState   = null;   // draft state from API
let allPlayers = [];     // full player list
let teamInfo   = {};     // team colors / info

let debugMessages = [];
let debugPanel = null;
const DEBUG_ENABLED = true;

// Sort state for Remaining Players tab
let sortCol = 'points';
let sortDir = 'desc';
let showDrafted = false;
let filterText = '';
let filterPos  = '';
let filterTeam = '';

function createDebugPanel() {
  if (!DEBUG_ENABLED) return;
  if (debugPanel) return;
  debugPanel = document.createElement('pre');
  debugPanel.id = 'debug-log';
  debugPanel.className = 'debug-log';
  debugPanel.textContent = 'Debug trace...';
  document.body.appendChild(debugPanel);
}

function updateDebugPanel() {
  if (!debugPanel) return;
  debugPanel.textContent = debugMessages.join('\n');
  debugPanel.scrollTop = debugPanel.scrollHeight;
}

function sendDebugToServer(message) {
  fetch('/api/debug_log', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
    keepalive: true,
  }).catch(() => {});
}

function logDebug(message) {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const line = `[DEBUG] ${timestamp} ${message}`;
  console.log(line);
  debugMessages.push(line);
  if (debugMessages.length > 40) {
    debugMessages.shift();
  }
  updateDebugPanel();
  sendDebugToServer(line);
}

function logError(message, error) {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const errText = error ? (error.stack || error.message || String(error)) : '';
  const line = `[ERROR] ${timestamp} ${message} ${errText}`;
  console.error(line);
  debugMessages.push(line);
  if (debugMessages.length > 40) {
    debugMessages.shift();
  }
  updateDebugPanel();
  sendDebugToServer(line);
}

window.addEventListener('error', event => {
  logError('window.onerror', event.error || event.message || event.filename);
});

window.addEventListener('unhandledrejection', event => {
  logError('unhandledrejection', event.reason || 'unknown reason');
});

logDebug('app.js loaded');

const playoffBracket = {
  east: {
    quarterfinals: [
      {label: 'A', seed: '1', team: 'BUF', opponent: 'BOS'},
      {label: 'B', seed: '2', team: 'TBL', opponent: 'MTL'},
      {label: 'C', seed: '1', team: 'CAR', opponent: 'OTT'},
      {label: 'D', seed: '2', team: 'PIT', opponent: 'PHI'},
    ],
    semifinals: [
      {label: 'E', team: 'Winner of A', opponent: 'Winner of B'},
      {label: 'F', team: 'Winner of C', opponent: 'Winner of D'},
    ],
    final: {label: 'G', team: 'Winner of E', opponent: 'Winner of F'},
  },
  west: {
    quarterfinals: [
      {label: 'H', seed: '1', team: 'COL', opponent: 'LAK'},
      {label: 'I', seed: '2', team: 'DAL', opponent: 'MIN'},
      {label: 'J', seed: '3', team: 'VGK', opponent: 'UTA'},
      {label: 'K', seed: '4', team: 'EDM', opponent: 'ANA'},
    ],
    semifinals: [
      {label: 'L', team: 'Winner of H', opponent: 'Winner of I'},
      {label: 'M', team: 'Winner of J', opponent: 'Winner of K'},
    ],
    final: {label: 'N', team: 'Winner of L', opponent: 'Winner of M'},
  },
  cupFinal: {label: 'O', team: 'Winner of G', opponent: 'Winner of N'},
};

// ── Boot ─────────────────────────────────────────────────────
async function init() {
  createDebugPanel();
  logDebug('init() started');
  teamInfo = window.TEAM_INFO || {};
  logDebug(`Loaded team info for ${Object.keys(teamInfo).length} teams`);

  try {
    logDebug('Calling loadState()');
    await loadState();
    logDebug('loadState() completed');
  } catch (err) {
    logError('State load failed:', err);
    showToast('Unable to load draft state. Check your connection or server.', 'error');
    return;
  }

  logDebug('Calling renderAll()');
  try {
    renderAll();
    logDebug('renderAll() completed');
  } catch (err) {
    logError('renderAll failed', err);
  }

  logDebug('Calling setupTabSwitching()');
  setupTabSwitching();
  logDebug('setupTabSwitching() completed');

  try {
    logDebug('Calling loadPlayers()');
    await loadPlayers();
    logDebug('loadPlayers() completed');
    renderRemainingPlayers();
    logDebug('renderRemainingPlayers() after loadPlayers completed');
  } catch (err) {
    logError('Player load failed:', err);
    showToast('Unable to load player stats yet. Use Refresh Players when ready.', 'error');
  }
}

async function loadState() {
  logDebug('fetch /api/state');
  const r = await fetch('/api/state');
  if (!r.ok) throw new Error(`State load failed: ${r.status}`);
  appState = await r.json();
  logDebug(`state loaded: setup_complete=${appState.setup_complete}, pool_players=${appState.pool_players.length}, picks=${Object.keys(appState.picks || {}).length}`);
}

async function loadPlayers() {
  logDebug('fetch /api/players');
  const r = await fetch('/api/players');
  if (!r.ok) throw new Error(`Players load failed: ${r.status}`);
  allPlayers = await r.json();
  logDebug(`players loaded: ${allPlayers.length}`);
}

function renderAll() {
  renderSetupTab();
  renderSelectionTab();
  renderDraftBoard();
  renderBracketTab();
  renderRemainingPlayers();
}

// ── Tab Switching ─────────────────────────────────────────────
function setupTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      // Re-render that specific tab
      if (target === 'tab-setup')     renderSetupTab();
      if (target === 'tab-selection') renderSelectionTab();
      if (target === 'tab-board')     renderDraftBoard();
      if (target === 'tab-bracket')   renderBracketTab();
      if (target === 'tab-remaining') renderRemainingPlayers();
    });
  });
}

// ── Tab 1: Draft Setup ────────────────────────────────────────
function renderSetupTab() {
  const el = document.getElementById('setup-content');
  const state = appState;

  if (state.setup_complete) {
    el.innerHTML = setupCompleteView(state);
  } else if (state.pool_players && state.pool_players.length > 0) {
    el.innerHTML = nameEntryView(state);
  } else {
    el.innerHTML = countInputView();
  }
}

function countInputView() {
  return `
    <div class="card" style="max-width:400px">
      <div class="card-header">🏒 How Many Pool Players?</div>
      <label>Number of pool players (2–20)</label>
      <div class="input-group">
        <input type="number" id="n-players-input" value="8" min="2" max="20" style="max-width:100px">
        <button class="btn btn-primary" onclick="submitPlayerCount()">Continue →</button>
      </div>
    </div>`;
}

function nameEntryView(state) {
  const n = state.pool_players.length;
  const fields = Array.from({length: n}, (_, i) =>
    `<div>
      <label>Player ${i + 1}</label>
      <input type="text" id="pool-name-${i}" value="${state.pool_players[i] || ''}" placeholder="e.g. Brett" autocomplete="off">
    </div>`
  ).join('');
  return `
    <div class="card" style="max-width:600px">
      <div class="card-header">👤 Name Your Pool Players</div>
      <p class="text-muted" style="margin-bottom:14px;font-size:0.85rem">
        Players will draft in this order for Round 1. The draft is snake format (rounds alternate direction).
      </p>
      <div style="margin-bottom:12px">
        <label>Pool Name</label>
        <input type="text" id="pool-name-input" value="${state.pool_name || ''}" placeholder="e.g. Friday Night Pool" autocomplete="off">
      </div>
      <div class="player-name-grid">${fields}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="submitPlayerNames()">Start Draft →</button>
        <button class="btn btn-ghost" onclick="resetCount()">← Change Count</button>
      </div>
    </div>`;
}

function setupCompleteView(state) {
  const n = state.pool_players.length;
  const total = n * state.n_rounds;
  const madePicksCount = Object.keys(state.picks || {}).length;

  // Build a visual of the first 2 rounds of draft order
  const previewRounds = Math.min(2, state.n_rounds);
  let orderPreview = '';
  for (let rnd = 0; rnd < previewRounds; rnd++) {
    const chips = [];
    const dir = rnd % 2 === 0;
    const arr = dir ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    arr.forEach(idx => {
      const pickNum = rnd * n + arr.indexOf(idx) + 1;
      const isCurrent = (rnd * n + arr.indexOf(idx)) === state.current_pick_index;
      chips.push(`<span class="draft-order-chip ${isCurrent ? 'current-pick' : ''}">#${pickNum} ${state.pool_players[idx]}</span>`);
    });
    orderPreview += `<div style="margin-bottom:8px"><span class="text-muted" style="font-size:0.75rem">Round ${rnd+1}:</span><br><div class="draft-order-display" style="margin-top:4px">${chips.join('')}</div></div>`;
  }

  return `
    <div class="card">
      <div class="card-header">✅ Draft Setup Complete</div>
      <div class="two-col">
        <div>
          <div style="margin-bottom:12px">
            <div style="margin-bottom:8px;font-size:0.95rem"><strong>Pool:</strong> ${state.pool_name || 'Main Pool'}</div>
            <span class="text-muted" style="font-size:0.8rem">Pool Players (${n})</span><br>
            <div class="draft-order-display" style="margin-top:6px">
              ${state.pool_players.map((p,i) => `<span class="draft-order-chip">${i+1}. ${p}</span>`).join('')}
            </div>
          </div>
          <div style="font-size:0.85rem;color:var(--text-dim)">
            <strong style="color:var(--text)">${madePicksCount}</strong> / ${total} picks made &nbsp;·&nbsp;
            <strong style="color:var(--text)">${state.n_rounds}</strong> rounds
          </div>
        </div>
        <div>
          <div style="margin-bottom:6px;font-size:0.8rem;color:var(--text-muted)">Draft Order Preview:</div>
          ${orderPreview}
        </div>
      </div>
      <hr class="divider">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="editSetup()">✏️ Edit Pool Players</button>
        <button class="btn btn-ghost btn-sm" onclick="exportCsv()">📄 Download CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="loadCsv()">📥 Load CSV</button>
        <button class="btn btn-danger btn-sm" onclick="confirmReset('picks')">🗑️ Reset All Picks</button>
        <button class="btn btn-danger btn-sm" onclick="confirmReset('full')">⚠️ Full Reset</button>
      </div>
    </div>`;
}

async function submitPlayerCount() {
  const n = parseInt(document.getElementById('n-players-input').value);
  if (n < 2 || n > 20) { showToast('Between 2 and 20 players!', 'error'); return; }
  await fetch('/api/setup_count', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({n_players: n})});
  await loadState();
  renderSetupTab();
}

async function submitPlayerNames() {
  const n = appState.pool_players.length;
  const names = Array.from({length: n}, (_, i) => {
    const input = document.getElementById(`pool-name-${i}`);
    return input && input.value ? input.value : '';
  });
  const poolNameInput = document.getElementById('pool-name-input');
  const poolName = poolNameInput && poolNameInput.value ? poolNameInput.value.trim() : 'Main Pool';
  if (names.some(n => !n.trim())) { showToast('All players need names!', 'error'); return; }
  await fetch('/api/save_pool_players', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({names, pool_name: poolName})});
  await loadState();
  renderAll();
  showToast(`Draft set up for ${n} players — ${n * appState.n_rounds} total picks!`, 'success');
}

async function resetCount() {
  await fetch('/api/full_reset', {method:'POST'});
  await loadState();
  renderSetupTab();
}

function editSetup() {
  const el = document.getElementById('setup-content');
  el.innerHTML = nameEntryView(appState);
}

// ── Tab 2: Player Selection ────────────────────────────────────
function renderSelectionTab() {
  const el = document.getElementById('selection-content');
  const state = appState;

  if (!state.setup_complete) {
    el.innerHTML = `<div class="alert alert-info">⚡ Please complete the draft setup first (Tab 1).</div>`;
    return;
  }

  const n = state.pool_players.length;
  const total = n * state.n_rounds;
  const cur = state.current_pick_index;
  const isDraftDone = cur >= total;

  let banner = '';
  if (isDraftDone) {
    banner = `<div class="draft-complete-banner"><h2>🏆 Draft Complete!</h2><p>All ${total} picks have been made.</p></div>`;
  } else {
    const poolIdx = state.draft_order[cur];
    const poolPlayer = state.pool_players[poolIdx];
    const round = Math.floor(cur / n) + 1;
    const pickInRound = (cur % n) + 1;
    banner = `
      <div class="pick-banner">
        <div class="pick-info">
          <span class="pick-label">Now Drafting</span>
          <span class="pick-who">${poolPlayer}</span>
          <span class="pick-round">Round ${round} &nbsp;·&nbsp; Pick ${pickInRound} of ${n} &nbsp;·&nbsp; Overall Pick #${cur + 1}</span>
          <span class="pick-pool">Pool: ${state.pool_name || 'Main Pool'}</span>
        </div>
        <div class="pick-nav">
          <button class="btn btn-ghost btn-sm" onclick="navPick(-1)" title="Previous pick">◀</button>
          <span class="pick-counter">${cur + 1} / ${total}</span>
          <button class="btn btn-ghost btn-sm" onclick="navPick(1)" title="Next pick">▶</button>
        </div>
      </div>`;
  }

  const existingPick = state.picks ? (state.picks[String(cur)] || null) : null;

  el.innerHTML = `
    ${banner}
    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-header">🔍 Select Player</div>
          <div id="pick-alert"></div>
          <label>Search by name (first, last, or partial)</label>
          <div class="autocomplete-wrapper">
            <input type="text" id="player-search" placeholder="e.g. McD, Connor, McDavid…" autocomplete="off"
              value="${existingPick ? existingPick.nhl_player : ''}">
            <div class="autocomplete-dropdown" id="ac-dropdown"></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-primary" onclick="submitPick()" ${isDraftDone ? 'disabled' : ''}>
              ${existingPick ? '✏️ Update Pick' : '✅ Confirm Pick'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="clearPickInput()">✕ Clear</button>
          </div>
        </div>
      </div>
      <div>
        <div class="card" style="max-height:220px;overflow-y:auto">
          <div class="card-header" style="position:sticky;top:0;background:var(--surface);z-index:5">📋 Remaining Draft Slots</div>
          ${renderUpcomingPicks(state, cur)}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">📝 Draft Log</div>
      <div class="table-wrapper">${renderPicksTable(state)}</div>
    </div>`;

  setupAutocomplete();
}

function renderUpcomingPicks(state, cur) {
  const n = state.pool_players.length;
  const total = n * state.n_rounds;
  const picks = state.picks || {};
  let rows = '';
  for (let i = 0; i < Math.min(cur + 12, total); i++) {
    const poolIdx = state.draft_order[i];
    const player  = state.pool_players[poolIdx];
    const round   = Math.floor(i / n) + 1;
    const pk      = picks[String(i)];
    const isCur   = i === cur;
    rows += `<tr style="${isCur ? 'background:rgba(59,130,246,0.1)' : ''}">
      <td style="font-size:0.75rem;color:var(--text-muted)">#${i+1}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">Rd ${round}</td>
      <td style="font-weight:${isCur ? '700' : 'normal'};color:${isCur ? 'var(--accent2)' : 'var(--text-dim)'}">${player}</td>
      <td style="font-size:0.78rem;color:${pk ? 'var(--text-dim)' : 'var(--text-muted)'}">${pk ? pk.nhl_player : '<em style="color:var(--text-muted)">–</em>'}</td>
    </tr>`;
  }
  return `<table><thead><tr><th>#</th><th>Round</th><th>Pool Player</th><th>NHL Player</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPicksTable(state) {
  const picks = Object.values(state.picks || {}).filter(Boolean)
    .sort((a, b) => a.pick_index - b.pick_index);

  if (!picks.length) return `<p class="text-muted" style="padding:16px;text-align:center">No picks yet.</p>`;

  const rows = picks.map(pk => {
    const info = teamInfo[pk.team] || {};
    const color = info.primary || '#333';
    const textCol = info.text || '#fff';
    const logo = info.logo ? `<img class="team-logo team-logo-small" src="${info.logo}" alt="${pk.team} logo">` : '';
    return `<tr class="pick-row" onclick="editPick(${pk.pick_index})">
      <td><span style="color:var(--text-muted);font-size:0.75rem">#${pk.overall_pick}</span></td>
      <td><span class="badge badge-blue">Rd ${pk.round}</span></td>
      <td style="font-weight:600">${pk.pool_player}</td>
      <td><strong>${pk.nhl_player}</strong></td>
      <td>${logo}<span class="team-badge" style="background:${color};color:${textCol}">${pk.team}</span></td>
      <td class="pos-${pk.position}">${pk.position}</td>
      <td class="stat-num">${pk.goals}</td>
      <td class="stat-num">${pk.assists}</td>
      <td class="stat-num text-gold">${pk.points}</td>
      <td><button class="edit-pick-btn">Edit</button></td>
    </tr>`;
  }).join('');

  return `<table>
    <thead><tr>
      <th>Pick</th><th>Round</th><th>Pool Player</th><th>NHL Player</th>
      <th>Team</th><th>Pos</th><th>G</th><th>A</th><th>PTS</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Autocomplete ──────────────────────────────────────────────
let acFocusIdx = -1;

function setupAutocomplete() {
  const input = document.getElementById('player-search');
  const dropdown = document.getElementById('ac-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    acFocusIdx = -1;
    renderDropdown(input.value, dropdown);
  });

  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acFocusIdx = Math.min(acFocusIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('focused', i === acFocusIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acFocusIdx = Math.max(acFocusIdx - 1, -1);
      items.forEach((el, i) => el.classList.toggle('focused', i === acFocusIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acFocusIdx >= 0 && items[acFocusIdx]) {
        items[acFocusIdx].click();
      } else {
        submitPick();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrapper')) dropdown.classList.remove('open');
  });
}

function renderDropdown(query, dropdown) {
  if (!query || query.length < 1) { dropdown.classList.remove('open'); return; }
  const q = query.toLowerCase();
  const matches = allPlayers
    .filter(p => !p.drafted && (
      p.name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.first_name.toLowerCase().includes(q)
    ))
    .slice(0, 15);

  if (!matches.length) {
    dropdown.innerHTML = `<div class="autocomplete-item"><span class="text-muted">No available players found</span></div>`;
    dropdown.classList.add('open');
    return;
  }

  dropdown.innerHTML = matches.map(p => {
    const info = teamInfo[p.team] || {};
    const color = info.primary || '#333';
    const tcolor = info.text || '#fff';
    const logo = info.logo ? `<img class="team-logo team-logo-small" src="${info.logo}" alt="${p.team} logo">` : '';
    return `<div class="autocomplete-item" onclick="selectPlayer('${p.name.replace(/'/g,"\\'")}')">
      ${logo}
      <div style="flex:1">
        <div class="ac-name">${highlightMatch(p.name, q)}</div>
        <div class="ac-meta">
          <span class="team-badge" style="background:${color};color:${tcolor}">${p.team}</span>
          <span class="pos-${p.position}">${p.position}</span>
          <span>${p.points} pts</span>
          <span>${p.goals}G ${p.assists}A</span>
        </div>
      </div>
    </div>`;
  }).join('');

  dropdown.classList.add('open');
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return text.slice(0, idx) + `<mark style="background:rgba(59,130,246,0.4);color:inherit;border-radius:2px">${text.slice(idx, idx + query.length)}</mark>` + text.slice(idx + query.length);
}

function selectPlayer(name) {
  const input = document.getElementById('player-search');
  const dropdown = document.getElementById('ac-dropdown');
  if (input) input.value = name;
  if (dropdown) dropdown.classList.remove('open');
}

function clearPickInput() {
  const input = document.getElementById('player-search');
  if (input) { input.value = ''; input.focus(); }
  const dropdown = document.getElementById('ac-dropdown');
  if (dropdown) dropdown.classList.remove('open');
}

async function submitPick() {
  const input = document.getElementById('player-search');
  const playerName = input ? input.value.trim() : '';
  if (!playerName) { showPickAlert('Please select a player first.', 'error'); return; }

  const res = await fetch('/api/make_pick', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ player_name: playerName, pick_index: appState.current_pick_index })
  });
  const data = await res.json();

  if (!data.success) { showPickAlert(data.error, 'error'); return; }

  // Update local state
  await loadState();
  await loadPlayers();
  renderAll();
  showToast(`✅ ${playerName} drafted by ${data.pick.pool_player}!`, 'success');
}

async function editPick(pickIndex) {
  const res = await fetch('/api/set_current_pick', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pick_index: pickIndex })
  });
  const data = await res.json();
  await loadState();
  renderSelectionTab();
  document.getElementById('player-search').focus();

  // Switch to selection tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="tab-selection"]').classList.add('active');
  document.getElementById('tab-selection').classList.add('active');
}

async function navPick(dir) {
  const newIdx = appState.current_pick_index + dir;
  const n = appState.pool_players.length;
  const total = n * appState.n_rounds;
  if (newIdx < 0 || newIdx >= total) return;

  await fetch('/api/set_current_pick', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pick_index: newIdx })
  });
  await loadState();
  renderSelectionTab();
}

function showPickAlert(msg, type) {
  const el = document.getElementById('pick-alert');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

// ── Tab 3: Draft Board ─────────────────────────────────────────
function renderDraftBoard() {
  const el = document.getElementById('board-content');
  const state = appState;

  if (!state.setup_complete) {
    el.innerHTML = `<div class="alert alert-info">⚡ Complete the draft setup first.</div>`;
    return;
  }

  const n = state.pool_players.length;
  const rounds = state.n_rounds;
  const picks  = state.picks || {};

  // Header row
  let thead = '<tr><th class="player-col">Pool Player</th>';
  for (let r = 1; r <= rounds; r++) thead += `<th>Round ${r}</th>`;
  thead += '</tr>';

  // Data rows — one per pool player
  let tbody = '';
  state.pool_players.forEach((player, playerIdx) => {
    tbody += `<tr><td class="pool-player-cell">${player}</td>`;
    for (let rnd = 0; rnd < rounds; rnd++) {
      // Find which overall pick index corresponds to this player/round
      const dir = rnd % 2 === 0;
      const pickInRound = dir ? playerIdx : (n - 1 - playerIdx);
      const overallIdx = rnd * n + pickInRound;
      const pk = picks[String(overallIdx)];
      if (pk) {
        const info = teamInfo[pk.team] || {};
        const bg = info.primary || '#1a2235';
        const txt = info.text || '#ffffff';
        const logo = info.logo ? `<img class="team-logo team-logo-board" src="${info.logo}" alt="${pk.team} logo">` : '';
        tbody += `<td>
          <div class="board-cell" style="background:${bg};color:${txt}" onclick="editPick(${pk.pick_index})" title="#${pk.overall_pick}: ${pk.nhl_player} (${pk.team})">
            <div class="cell-text">
              <span class="cell-name">${pk.last_name}</span>
              <span class="cell-team">${pk.team}</span>
            </div>
            ${logo}
          </div>
        </td>`;
      } else {
        tbody += `<td>
          <div class="board-cell empty" onclick="editPick(${overallIdx})">
            <span style="font-size:0.65rem">Rd${rnd+1} #${overallIdx+1}</span>
          </div>
        </td>`;
      }
    }
    tbody += '</tr>';
  });

  el.innerHTML = `
    <div class="card">
      <div class="card-header">🏒 Draft Board — ${state.pool_name || 'Main Pool'} — ${Object.keys(picks).length}/${n * rounds} picks made</div>
      <div class="board-wrapper">
        <table class="draft-board">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Tab 4: Remaining Players ───────────────────────────────────
function renderRemainingPlayers() {
  const el = document.getElementById('remaining-content');

  const positions = [...new Set(allPlayers.map(p => p.position))].sort();
  const teams     = [...new Set(allPlayers.map(p => p.team))].sort();

  el.innerHTML = `
    <div class="card">
      <div class="card-header">📊 All Playoff Players</div>
      <div class="filter-bar">
        <div style="flex:1;min-width:180px">
          <input type="text" id="remain-search" placeholder="Search player name…" value="${filterText}" oninput="onFilterChange('text', this.value)">
        </div>
        <select id="remain-pos" onchange="onFilterChange('pos', this.value)" style="max-width:110px">
          <option value="">All Pos</option>
          ${positions.map(p => `<option value="${p}" ${filterPos === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <select id="remain-team" onchange="onFilterChange('team', this.value)" style="max-width:110px">
          <option value="">All Teams</option>
          ${teams.map(t => `<option value="${t}" ${filterTeam === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <label class="show-drafted-toggle">
          <input type="checkbox" ${showDrafted ? 'checked' : ''} onchange="onFilterChange('drafted', this.checked)">
          Show drafted
        </label>
        <span id="remain-count" class="text-muted" style="font-size:0.82rem;white-space:nowrap"></span>
      </div>
      <div class="table-wrapper" id="remain-table"></div>
    </div>`;

  renderRemainingTable();
}

function onFilterChange(type, val) {
  if (type === 'text')    filterText = val;
  if (type === 'pos')     filterPos  = val;
  if (type === 'team')    filterTeam = val;
  if (type === 'drafted') showDrafted = val;
  renderRemainingTable();
}

function renderBracketTab() {
  const el = document.getElementById('bracket-content');
  if (!el) return;

  el.innerHTML = `
    <div class="card">
      <div class="card-header">🏆 2026 Playoff Bracket</div>
      <div class="bracket-layout">
        <div class="bracket-side">
          ${renderBracketSide('Eastern Conference', playoffBracket.east)}
        </div>
        <div class="bracket-final-panel">
          <div class="bracket-stage-label">Stanley Cup Final</div>
          ${renderBracketMatch(playoffBracket.cupFinal)}
        </div>
        <div class="bracket-side">
          ${renderBracketSide('Western Conference', playoffBracket.west)}
        </div>
      </div>
    </div>`;
}

function renderBracketSide(title, sideData) {
  return `
    <div class="bracket-conference">
      <div class="bracket-conference-title">${title}</div>
      <div class="bracket-columns">
        <div class="bracket-column">
          <div class="bracket-stage-label">First Round</div>
          ${sideData.quarterfinals.map(match => renderBracketMatch(match)).join('')}
        </div>
        <div class="bracket-column">
          <div class="bracket-stage-label">Second Round</div>
          ${sideData.semifinals.map(match => renderBracketMatch(match)).join('')}
        </div>
        <div class="bracket-column">
          <div class="bracket-stage-label">Conference Final</div>
          ${renderBracketMatch(sideData.final)}
        </div>
      </div>
    </div>`;
}

function renderBracketMatch(match) {
  if (!match) return '';
  return `
    <div class="bracket-match">
      ${match.label ? `<div class="bracket-match-label">Series ${match.label}</div>` : ''}
      ${renderBracketTeam(match.team, match.seed)}
      <div class="bracket-vs">vs</div>
      ${renderBracketTeam(match.opponent, '')}
    </div>`;
}

function renderBracketTeam(teamCode, seed) {
  const hasInfo = Boolean(teamInfo[teamCode]);
  const info = teamInfo[teamCode] || {name: '', primary: '#334155', text: '#ffffff'};
  const subtitle = hasInfo ? info.name : '';
  const logo = info.logo ? `<img class="bracket-team-logo" src="${info.logo}" alt="${teamCode} logo">` : '';
  return `
    <div class="bracket-team" style="border-left-color:${info.primary};">
      ${logo}
      <div class="bracket-team-label">
        ${seed ? `<span class="bracket-seed">${seed}</span>` : ''}
        <span class="bracket-team-name">${teamCode}</span>
      </div>
      ${subtitle ? `<div class="bracket-team-subtitle">${subtitle}</div>` : ''}
    </div>`;
}

function renderRemainingTable() {
  let data = allPlayers.filter(p => {
    if (!showDrafted && p.drafted) return false;
    if (filterPos  && p.position !== filterPos)  return false;
    if (filterTeam && p.team     !== filterTeam) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      if (!p.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Sort
  data = data.slice().sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const countEl = document.getElementById('remain-count');
  const available = data.filter(p => !p.drafted).length;
  if (countEl) countEl.textContent = `${available} available · ${data.filter(p => p.drafted).length} drafted`;

  const tableEl = document.getElementById('remain-table');
  if (!tableEl) return;

  if (!data.length) {
    tableEl.innerHTML = `<p class="text-muted" style="padding:20px;text-align:center">No players match your filters.</p>`;
    return;
  }

  const cols = [
    {key:'name',    label:'Player',       cls:''},
    {key:'logo',    label:'Logo',         cls:'text-center'},
    {key:'team',    label:'Team',         cls:''},
    {key:'position',label:'Pos',          cls:''},
    {key:'games',   label:'GP',           cls:''},
    {key:'goals',   label:'G',            cls:''},
    {key:'assists', label:'A',            cls:''},
    {key:'points',  label:'PTS',          cls:'text-gold'},
    {key:'ppg',     label:'P/GP',         cls:''},
  ];

  const ths = cols.map(c => {
    const active = sortCol === c.key;
    const cls = `${c.cls} ${c.key !== 'logo' ? `sortable${active ? (sortDir === 'asc' ? ' sort-asc' : ' sort-desc') : ''}` : ''}`.trim();
    return `<th class="${cls}" ${c.key !== 'logo' ? `onclick="sortTable('${c.key}')"` : ''}>${c.label}</th>`;
  }).join('');

  const rows = data.map(p => {
    const drafted = p.drafted;
    const info = teamInfo[p.team] || {};
    const bg = info.primary || '#333';
    const tc = info.text || '#fff';
    const logo = info.logo ? `<img class="team-logo team-logo-small" src="${info.logo}" alt="${p.team} logo">` : '';
    return `<tr class="${drafted ? 'drafted-row' : ''}">
      <td style="font-weight:${drafted ? 'normal' : '600'}">${drafted ? '🚫 ' : ''}${p.name}</td>
      <td class="player-logo-cell">${logo}</td>
      <td><span class="team-badge" style="background:${bg};color:${tc}">${p.team}</span></td>
      <td class="pos-${p.position}">${p.position}</td>
      <td class="stat-num">${p.games}</td>
      <td class="stat-num">${p.goals}</td>
      <td class="stat-num">${p.assists}</td>
      <td class="stat-num text-gold">${p.points}</td>
      <td class="stat-num">${p.ppg.toFixed(3)}</td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `<table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function sortTable(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = col === 'name' || col === 'team' || col === 'position' ? 'asc' : 'desc'; }
  renderRemainingTable();
}

// ── Reset / Confirm ────────────────────────────────────────────
function confirmReset(type) {
  const modal = document.getElementById('confirm-modal');
  const msg   = document.getElementById('confirm-msg');
  if (type === 'picks') {
    msg.textContent = 'This will clear all draft picks but keep your pool player names. Continue?';
    document.getElementById('confirm-ok').onclick = async () => {
      await fetch('/api/reset_draft', {method:'POST'});
      await loadState();
      renderAll();
      modal.classList.remove('open');
      showToast('All picks cleared.', 'success');
    };
  } else {
    msg.textContent = 'This will completely reset the draft — all pool players and picks will be erased. Continue?';
    document.getElementById('confirm-ok').onclick = async () => {
      await fetch('/api/full_reset', {method:'POST'});
      await loadState();
      renderAll();
      modal.classList.remove('open');
      showToast('Full reset done.', 'success');
    };
  }
  modal.classList.add('open');
}

// ── CSV Export / Load ─────────────────────────────────────────
function exportCsv() { window.location.href = '/api/export_csv'; }

async function loadCsv() {
  const res = await fetch('/api/load_csv', {method:'POST'});
  const data = await res.json();
  if (!data.success) { showToast(data.error || 'Unable to load CSV.', 'error'); return; }
  await loadState();
  await loadPlayers();
  renderAll();
  showToast('✅ Draft loaded from CSV and ready to continue.', 'success');
}

// ── Excel Export ───────────────────────────────────────────────
function exportExcel() { window.location.href = '/api/export_excel'; }

// ── Refresh Players ────────────────────────────────────────────
async function refreshPlayers() {
  showToast('Fetching fresh player data from NHL API…', 'info');
  const r = await fetch('/api/refresh_players', {method:'POST'});
  const d = await r.json();
  await loadPlayers();
  renderRemainingPlayers();
  showToast(`✅ Loaded ${d.count} players from NHL API.`, 'success');
}

// ── Toast ──────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Boot ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
