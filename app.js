// ⚽ 足彩泊松分析 - 前端完整版
// 数据源：Yiminshuixing/football.json (GitHub)
// 赔率：The Odds API
// 算法：Poisson 分布 + Kelly 公式

// ============ 配置区 ============
const CONFIG = {
  ODDS_API_KEY: 'efc0bf96ed9d8255c706f2185a15e42e',
  GITHUB_RAW: 'https://raw.githubusercontent.com/Yiminshuixing/football.json/master',
  WEIGHT_RECENT: 0.7,
  WEIGHT_ALL: 0.3,
  KELLY_FACTOR: 0.25,
  CACHE_TTL: 6 * 60 * 60 * 1000, // 6小时缓存
};

// ============ 数据表 ============
const LEAGUE_INFO = {
  'en.1': {'name': '英格兰超级联赛（英超）', 'season_default': '2025-26'},
  'en.2': {'name': '英格兰冠军联赛（英冠）', 'season_default': '2025-26'},
  'de.1': {'name': '德国超级联赛（德甲）', 'season_default': '2025-26'},
  'de.2': {'name': '德国乙级联赛（德乙）', 'season_default': '2025-26'},
  'es.1': {'name': '西班牙超级联赛（西甲）', 'season_default': '2025-26'},
  'es.2': {'name': '西班牙乙级联赛（西乙）', 'season_default': '2025-26'},
  'it.1': {'name': '意大利超级联赛（意甲）', 'season_default': '2025-26'},
  'it.2': {'name': '意大利乙级联赛（意乙）', 'season_default': '2025-26'},
  'fr.1': {'name': '法国超级联赛（法甲）', 'season_default': '2025-26'},
  'fr.2': {'name': '法国乙级联赛（法乙）', 'season_default': '2025-26'},
  'au.1': {'name': '澳大利亚超级联赛（澳超）', 'season_default': '2024-25'},
  'cn.1': {'name': '中国超级联赛（中超）', 'season_default': '2026'},
  'jp.1': {'name': '日本职业联赛（J联赛）', 'season_default': '2025'},
};

const SEASONS_BY_LEAGUE = {
  'en.1': ['2025-26', '2024-25'],
  'en.2': ['2024-25'],
  'de.1': ['2025-26', '2024-25'],
  'de.2': ['2024-25'],
  'es.1': ['2025-26', '2024-25'],
  'es.2': ['2024-25'],
  'it.1': ['2025-26', '2024-25'],
  'it.2': ['2024-25'],
  'fr.1': ['2025-26', '2024-25'],
  'fr.2': ['2025-26', '2024-25'],
  'au.1': ['2024-25'],
  'cn.1': ['2026', '2025'],
  'jp.1': ['2025'],
};

const ODDS_TEAM_ALIAS = {
  'Beijing FC': 'Beijing Guoan',
  'Changchun Yatai FC': 'Changchun Yatai',
  'Chengdu Rongcheng FC': 'Chengdu Rongcheng',
  'Chongqing Tonglianglong FC': 'Chongqing Tonglianglong',
  'Dalian Yingbo': 'Dalian Yingbo',
  'Henan FC': 'Henan FC',
  'Liaoning Tieren FC': 'Liaoning Tieren',
  'Meizhou Hakka': 'Meizhou Hakka',
  'Qingdao Hainiu FC': 'Qingdao Hainiu',
  'Qingdao West Coast FC': 'Qingdao West Coast',
  'Shandong Luneng Taishan FC': 'Shandong Taishan',
  'Shanghai SIPG FC': 'Shanghai Port FC',
  'Shanghai Shenhua FC': 'Shanghai Shenhua',
  'Shenzhen Peng City FC': 'Shenzhen Peng City',
  'Tianjin Jinmen Tiger FC': 'Tianjin Jinmen Tiger',
  'Wuhan Three Towns': 'Wuhan Three Towns',
  'Yunnan Yukun': 'Yunnan Yukun',
  'Zhejiang': 'Zhejiang Professional',
};

const LEAGUE_SPORT_KEYS = {
  'en.1': 'soccer_epl',
  'en.2': 'soccer_efl_champ',
  'de.1': 'soccer_germany_bundesliga',
  'de.2': 'soccer_germany_bundesliga2',
  'es.1': 'soccer_spain_la_liga',
  'es.2': 'soccer_spain_segunda_division',
  'it.1': 'soccer_italy_serie_a',
  'it.2': 'soccer_italy_serie_b',
  'fr.1': 'soccer_france_ligue_one',
  'fr.2': 'soccer_france_ligue_two',
  'nl.1': 'soccer_netherlands_eredivisie',
  'pt.1': 'soccer_portugal_primeira_liga',
  'be.1': 'soccer_belgium_first_div',
  'gr.1': 'soccer_greece_super_league',
  'tr.1': 'soccer_turkey_super_league',
  'sc.1': 'soccer_spl',
  'au.1': 'soccer_australia_aleague',
  'cn.1': 'soccer_china_superleague',
  'jp.1': 'soccer_japan_j_league',
  'kr.1': 'soccer_korea_kleague1',
};

// 球队名映射（608条），从 JSON 加载
let TEAM_NAME_MAP = {};

// ============ 工具函数 ============
async function loadTeamMap() {
  try {
    const r = await fetch('team_map.json?_=' + Date.now());
    TEAM_NAME_MAP = await r.json();
    return true;
  } catch (e) {
    console.error('球队映射加载失败:', e);
    return false;
  }
}

function normalizeName(name) {
  const n = name.trim();
  if (TEAM_NAME_MAP[n]) return TEAM_NAME_MAP[n];
  const nl = n.toLowerCase();
  if (TEAM_NAME_MAP[nl]) return TEAM_NAME_MAP[nl];
  for (const [key, val] of Object.entries(TEAM_NAME_MAP)) {
    if (nl.includes(key.toLowerCase()) || key.toLowerCase().includes(nl)) {
      return val;
    }
  }
  return name;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============ 缓存 ============
function getCache(key) {
  try {
    const raw = localStorage.getItem('cache_' + key);
    if (!raw) return null;
    const {ts, data} = JSON.parse(raw);
    if (Date.now() - ts > CONFIG.CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem('cache_' + key, JSON.stringify({ts: Date.now(), data}));
  } catch { /* 存不下就忽略 */ }
}

// ============ 数据获取 ============
async function fetchJSON(url) {
  const cached = getCache(url);
  if (cached) return cached;
  
  const resp = await fetch(url, {method: 'GET'});
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  const data = await resp.json();
  setCache(url, data);
  return data;
}

async function fetchLeagueData(season, leagueCode) {
  const url = `${CONFIG.GITHUB_RAW}/${season}/${leagueCode}.json`;
  return fetchJSON(url);
}

function getTeamsFromMatches(matches) {
  const teams = [];
  const seen = new Set();
  for (const m of matches) {
    const t1 = m.team1.trim();
    const t2 = m.team2.trim();
    if (t1 && !seen.has(t1)) { seen.add(t1); teams.push(t1); }
    if (t2 && !seen.has(t2)) { seen.add(t2); teams.push(t2); }
  }
  teams.sort();
  return teams;
}

function getTeamMatches(matches, teamName) {
  const results = [];
  const normalized = normalizeName(teamName);
  
  for (const m of matches) {
    const t1 = m.team1 || '';
    const t2 = m.team2 || '';
    const t1n = normalizeName(t1);
    const t2n = normalizeName(t2);
    
    let isHome = (normalized === t1n) || (teamName.toLowerCase() === t1.toLowerCase()) || (normalized.toLowerCase() === t1.toLowerCase());
    let isAway = (normalized === t2n) || (teamName.toLowerCase() === t2.toLowerCase()) || (normalized.toLowerCase() === t2.toLowerCase());
    
    if (!isHome && !isAway) {
      if (normalized !== teamName) {
        if (normalized.toLowerCase().includes(t1.toLowerCase()) || t1.toLowerCase().includes(normalized.toLowerCase())) isHome = true;
        if (normalized.toLowerCase().includes(t2.toLowerCase()) || t2.toLowerCase().includes(normalized.toLowerCase())) isAway = true;
      }
    }
    
    if (!isHome && !isAway) continue;
    
    let ft = [0, 0];
    const score = m.score;
    if (Array.isArray(score)) {
      ft = score.slice(0, 2);
    } else if (score && score.ft) {
      ft = score.ft;
    }
    
    const goalsFor = isHome ? ft[0] : ft[1];
    const goalsAgainst = isHome ? ft[1] : ft[0];
    
    results.push({
      date: m.date || '',
      round: m.round || '',
      team1: t1, team2: t2,
      isHome,
      goalsFor, goalsAgainst,
      ft,
      won: goalsFor > goalsAgainst,
      draw: goalsFor === goalsAgainst,
      lost: goalsFor < goalsAgainst,
      opponent: isHome ? t2 : t1,
    });
  }
  
  results.sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });
  return results;
}

// ============ 泊松分布 ============
function poissonProb(k, lam) {
  if (lam < 0 || k < 0) return 0;
  return Math.pow(lam, k) * Math.exp(-lam) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function buildScoreMatrix(lamHome, lamAway, maxGoals) {
  maxGoals = maxGoals || 5;
  const matrix = {};
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      matrix[`${i}-${j}`] = poissonProb(i, lamHome) * poissonProb(j, lamAway);
    }
  }
  return matrix;
}

function calcOutcomes(matrix) {
  let homeWin = 0, draw = 0, awayWin = 0;
  let over25 = 0, totalGoals = 0;
  for (const [key, p] of Object.entries(matrix)) {
    const [i, j] = key.split('-').map(Number);
    if (i > j) homeWin += p;
    else if (i === j) draw += p;
    else awayWin += p;
    if (i + j >= 2.5) over25 += p;
    totalGoals += p * (i + j);
  }
  return { homeWin, draw, awayWin, totalGoals, over25, under25: 1 - over25 };
}

function kellyFraction(b, p, factor) {
  factor = factor || CONFIG.KELLY_FACTOR;
  const q = 1 - p;
  const f = b > 0 ? (b * p - q) / b : 0;
  return Math.max(0, Math.min(f, 1)) * factor;
}

function oddsToImplied(odds) {
  return odds > 0 ? 1 / odds : 0;
}

function calcValue(modelProb, impliedProb) {
  return impliedProb > 0 ? modelProb / impliedProb : 0;
}

// ============ 球队实力 ============
function calcStrength(recent, allMatches) {
  const avgRecentFor = recent.length > 0 ? recent.reduce((s, m) => s + m.goalsFor, 0) / recent.length : 0;
  const avgRecentAgainst = recent.length > 0 ? recent.reduce((s, m) => s + m.goalsAgainst, 0) / recent.length : 0;
  const avgAllFor = allMatches.length > 0 ? allMatches.reduce((s, m) => s + m.goalsFor, 0) / allMatches.length : 0;
  const avgAllAgainst = allMatches.length > 0 ? allMatches.reduce((s, m) => s + m.goalsAgainst, 0) / allMatches.length : 0;
  
  const attack = avgRecentFor * CONFIG.WEIGHT_RECENT + avgAllFor * CONFIG.WEIGHT_ALL;
  const defense = avgRecentAgainst * CONFIG.WEIGHT_RECENT + avgAllAgainst * CONFIG.WEIGHT_ALL;
  
  return {
    attack, defense,
    avgRecentFor, avgRecentAgainst,
    avgAllFor, avgAllAgainst,
    recentCount: recent.length,
    allCount: allMatches.length,
    recentMatches: recent,
  };
}

function calcLambda(homeS, awayS, leagueAvg) {
  const awayDefFactor = leagueAvg > 0 ? awayS.defense / leagueAvg : 1;
  const homeLam = homeS.attack * awayDefFactor;
  const homeDefFactor = leagueAvg > 0 ? homeS.defense / leagueAvg : 1;
  const awayLam = awayS.attack * homeDefFactor;
  return { homeLam, awayLam };
}

// ============ 赔率获取 ============
function resolveApiTeamName(apiName) {
  return ODDS_TEAM_ALIAS[apiName] || apiName;
}

async function fetchOdds(leagueCode) {
  const sportKey = LEAGUE_SPORT_KEYS[leagueCode];
  if (!sportKey) return null;
  
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${CONFIG.ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
  
  try {
    const resp = await fetch(url);
    const remaining = resp.headers.get('x-requests-remaining') || '?';
    const data = await resp.json();
    
    if (Array.isArray(data)) {
      const index = {};
      for (const game of data) {
        const ht = resolveApiTeamName(game.home_team || '');
        const away = resolveApiTeamName(game.away_team || '');
        const matchTime = game.commence_time || '';
        
        let best = {home: null, draw: null, away: null};
        for (const bk of game.bookmakers || []) {
          for (const m of bk.markets || []) {
            if (m.key !== 'h2h') continue;
            for (const o of m.outcomes || []) {
              const name = o.name || '';
              const price = o.price || 0;
              const resolved = resolveApiTeamName(name);
              if (resolved === ht && (best.home === null || price > best.home)) best.home = price;
              else if (name === 'Draw' && (best.draw === null || price > best.draw)) best.draw = price;
              else if (resolved === away && (best.away === null || price > best.away)) best.away = price;
            }
          }
        }
        
        if (best.home && best.draw && best.away) {
          const key = `${ht} vs ${away}`;
          index[key] = {home: best.home, draw: best.draw, away: best.away, time: matchTime.slice(0, 19), remaining};
        }
      }
      return index;
    }
    return null;
  } catch (e) {
    console.error('赔率获取失败:', e);
    return null;
  }
}

function findOddsForMatch(oddsIndex, homeTeam, awayTeam) {
  if (!oddsIndex) return null;
  
  const key = `${homeTeam} vs ${awayTeam}`;
  if (oddsIndex[key]) return oddsIndex[key];
  
  const keyRev = `${awayTeam} vs ${homeTeam}`;
  if (oddsIndex[keyRev]) {
    const o = oddsIndex[keyRev];
    return {home: o.away, draw: o.draw, away: o.home, time: o.time, remaining: o.remaining};
  }
  
  for (const [k, v] of Object.entries(oddsIndex)) {
    if (k.includes(homeTeam) && k.includes(awayTeam)) {
      if (k.startsWith(homeTeam)) return v;
      if (k.startsWith(awayTeam)) return {home: v.away, draw: v.draw, away: v.home, time: v.time, remaining: v.remaining};
    }
  }
  
  return null;
}

// ============ 核心分析 ============
function calcLeagueAvg(matches) {
  let total = 0, count = 0;
  for (const m of matches) {
    const score = m.score;
    let ft = null;
    if (Array.isArray(score)) {
      ft = score;
    } else if (score && score.ft) {
      ft = score.ft;
    }
    if (ft && ft.length >= 2) {
      total += ft[0] + ft[1];
      count++;
    }
  }
  return count > 0 ? total / count : null;
}

async function runAnalysis(homeTeam, awayTeam, leagueCode, season, odds) {
  const data = await fetchLeagueData(season, leagueCode);
  if (!data || !data.matches || data.matches.length === 0) {
    throw new Error('获取比赛数据失败');
  }
  
  const matches = data.matches;
  const homeName = normalizeName(homeTeam);
  const awayName = normalizeName(awayTeam);
  
  // 联盟场均
  const leagueAvg = calcLeagueAvg(matches) || 2.65;
  
  // 取球队比赛
  const homeAll = getTeamMatches(matches, homeTeam);
  const awayAll = getTeamMatches(matches, awayTeam);
  
  const homeHome = homeAll.filter(m => m.isHome);
  const awayAway = awayAll.filter(m => !m.isHome);
  
  // 不足5场找上赛季补
  const {homeFinal, awayFinal, warnings} = await supplementMatches(homeHome, awayAway, homeTeam, awayTeam, leagueCode, season);
  
  const recentHome = homeFinal.slice(0, 5);
  const recentAway = awayFinal.slice(0, 5);
  
  const homeS = calcStrength(recentHome, homeFinal);
  const awayS = calcStrength(recentAway, awayFinal);
  const {homeLam, awayLam} = calcLambda(homeS, awayS, leagueAvg);
  
  const matrix = buildScoreMatrix(homeLam, awayLam);
  const outcomes = calcOutcomes(matrix);
  
  const kelly = {homeLam, awayLam};
  if (odds) {
    kelly.kellyHome = kellyFraction(odds.home - 1, outcomes.homeWin);
    kelly.valueHome = calcValue(outcomes.homeWin, oddsToImplied(odds.home));
    kelly.kellyDraw = kellyFraction(odds.draw - 1, outcomes.draw);
    kelly.valueDraw = calcValue(outcomes.draw, oddsToImplied(odds.draw));
    kelly.kellyAway = kellyFraction(odds.away - 1, outcomes.awayWin);
    kelly.valueAway = calcValue(outcomes.awayWin, oddsToImplied(odds.away));
  }
  
  return {homeName, awayName, homeS, awayS, outcomes, kelly, leagueAvg, odds, warnings, matrix, homeLam, awayLam};
}

async function supplementMatches(homeHome, awayAway, homeTeam, awayTeam, leagueCode, season) {
  const warnings = [];
  const maxRecent = 5;
  let h = [...homeHome];
  let a = [...awayAway];
  
  const needHome = maxRecent - h.length;
  const needAway = maxRecent - a.length;
  
  if (needHome <= 0 && needAway <= 0) return {homeFinal: h, awayFinal: a, warnings};
  
  // 上赛季
  const prevSeasons = SEASONS_BY_LEAGUE[leagueCode] || [];
  let prevSeason = null;
  for (const ps of prevSeasons) {
    if (ps !== season) { prevSeason = ps; break; }
  }
  
  if (prevSeason) {
    try {
      const prevData = await fetchLeagueData(prevSeason, leagueCode);
      if (prevData && prevData.matches) {
        if (needHome > 0) {
          const prevAll = getTeamMatches(prevData.matches, homeTeam);
          const prevHome = prevAll.filter(m => m.isHome);
          const topUp = prevHome.slice(0, needHome);
          h = h.concat(topUp);
          if (topUp.length > 0) warnings.push(`😅 主队数据不足，从上赛季补 ${topUp.length} 场`);
        }
        if (needAway > 0) {
          const prevAll = getTeamMatches(prevData.matches, awayTeam);
          const prevAway = prevAll.filter(m => !m.isHome);
          const topUp = prevAway.slice(0, needAway);
          a = a.concat(topUp);
          if (topUp.length > 0) warnings.push(`😅 客队数据不足，从上赛季补 ${topUp.length} 场`);
        }
      }
    } catch (e) {
      // 跨赛季数据不可用时忽略
    }
  }
  
  return {homeFinal: h, awayFinal: a, warnings};
}

// ============ UI ============
const state = {
  selectedLeague: null,
  selectedSeason: null,
  teams: [],
  homeTeam: '',
  awayTeam: '',
  odds: null,
};

function show(id) {
  document.querySelectorAll('section[aria-label]').forEach(el => el.hidden = true);
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function $(id) { return document.getElementById(id); }

function initLeagueButtons() {
  const grid = $('leagueGrid');
  grid.innerHTML = '';
  for (const [code, info] of Object.entries(LEAGUE_INFO)) {
    // 提取括号里的中文简称（如 "中超"、"英超"）
    const m = info.name.match(/（([^）]+)）/);
    const abbr = m ? m[1] : info.name;
    const fullName = info.name;
    const btn = document.createElement('button');
    btn.className = 'league-btn';
    // 中文简称为主，下方显示代码（总是可见）
    btn.innerHTML = `${abbr}<small>${code}</small>`;
    btn.title = fullName;
    btn.onclick = () => selectLeague(code);
    grid.appendChild(btn);
  }
}

function selectLeague(code) {
  state.selectedLeague = code;
  const seasons = SEASONS_BY_LEAGUE[code] || [];
  // 自动选最近赛季（数据源总是用最新可用的）
  state.selectedSeason = seasons[0] || '';
  const label = $('currentSeasonLabel');
  if (label) label.textContent = `· ${state.selectedSeason}赛季`;
  show('step3');
  loadTeams();
}

function selectSeason(season) {
  state.selectedSeason = season;
  show('step3');
  loadTeams();
}

async function loadTeams() {
  const loading = $('loadingTeams');
  loading.hidden = false;
  loading.setAttribute('aria-busy', 'true');
  
  try {
    const data = await fetchLeagueData(state.selectedSeason, state.selectedLeague);
    state.teams = getTeamsFromMatches(data.matches);
    
    const homeSelect = $('homeTeam');
    const awaySelect = $('awayTeam');
    
    homeSelect.innerHTML = '<option value="">-- 请选择主队 --</option>';
    awaySelect.innerHTML = '<option value="">-- 请选择客队 --</option>';
    
    for (const team of state.teams) {
      const cnName = getCNName(team);
      const display = team;
      // Try to find Chinese name
      let cn = '';
      for (const [key, val] of Object.entries(TEAM_NAME_MAP)) {
        if (val === team && /[\u4e00-\u9fff]/.test(key)) {
          cn = key;
          break;
        }
      }
      const label = cn ? `${cn} (${team})` : team;
      
      const opt1 = document.createElement('option');
      opt1.value = team;
      opt1.textContent = label;
      homeSelect.appendChild(opt1);
      
      const opt2 = document.createElement('option');
      opt2.value = team;
      opt2.textContent = label;
      awaySelect.appendChild(opt2);
    }
    
    $('analyzeBtn').disabled = true;
  } catch (e) {
    loading.textContent = '❌ 加载失败: ' + e.message;
  } finally {
    loading.hidden = true;
    loading.removeAttribute('aria-busy');
  }
}

function getCNName(engName) {
  for (const [key, val] of Object.entries(TEAM_NAME_MAP)) {
    if (val === engName && /[\u4e00-\u9fff]/.test(key)) {
      return key;
    }
  }
  return null;
}

function onTeamChange() {
  const home = $('homeTeam').value;
  const away = $('awayTeam').value;
  state.homeTeam = home;
  state.awayTeam = away;
  $('analyzeBtn').disabled = !home || !away || home === away;
}

async function onAnalyze() {
  show('step4');
}

async function onOddsAuto() {
  try {
    const code = state.selectedLeague;
    const nHome = normalizeName(state.homeTeam);
    const nAway = normalizeName(state.awayTeam);
    
    const oddsIndex = await fetchOdds(code);
    const found = findOddsForMatch(oddsIndex, nHome, nAway);
    
    if (found) {
      state.odds = found;
      const remaining = found.remaining || '?';
      showResultMessage(`✅ 已自动拉取赔率（余 ${remaining} 次请求）`);
      await doAnalysis();
    } else {
      showResultMessage('⚠️ 未找到该比赛的赔率数据');
      // 给小提示
      if (oddsIndex) {
        const msg = 'API 返回了 ' + Object.keys(oddsIndex).length + ' 场比赛，但未匹配到 ' + nHome + ' vs ' + nAway;
        showResultMessage(msg + '，手动试试？');
      } else {
        showResultMessage('该联赛可能不在 The Odds API 赛季中，请手动输入赔率');
      }
      // 返回步骤 4 让用户重选
      show('step4');
    }
  } catch (e) {
    showResultMessage('❌ 赔率获取失败: ' + e.message);
    show('step4');
  }
}

async function doAnalysis() {
  show('result');
  const content = $('resultContent');
  content.innerHTML = '<div aria-busy="true">⏳ 分析中...</div>';
  
  try {
    const result = await runAnalysis(
      state.homeTeam,
      state.awayTeam,
      state.selectedLeague,
      state.selectedSeason,
      state.odds
    );
    renderResult(result);
  } catch (e) {
    content.innerHTML = `<div class="error-box">❌ 分析失败: ${e.message}</div>`;
  }
}

function renderResult(r) {
  const c = $('resultContent');
  let html = '';
  
  // 标题
  html += `<div class="result-card">
    <h5>🏆 ${r.homeName} vs ${r.awayName}</h5>
    <small>${state.selectedLeague} · ${state.selectedSeason}赛季</small>
  </div>`;
  
  // 警告
  if (r.warnings && r.warnings.length > 0) {
    for (const w of r.warnings) {
      html += `<div class="warn-box">${w}</div>`;
    }
  }
  
  // 主队数据
  html += renderTeamCard(r.homeName, r.homeS, '主场', true);
  html += renderTeamCard(r.awayName, r.awayS, '客场', false);
  
  // 期望进球
  html += `<div class="result-card">
    <h5>🎯 期望进球（λ）</h5>
    <div class="metric-row">
      <span class="label">${r.homeName}</span>
      <span class="value">${r.homeLam.toFixed(3)}</span>
    </div>
    <div class="metric-row">
      <span class="label">${r.awayName}</span>
      <span class="value">${r.awayLam.toFixed(3)}</span>
    </div>
  </div>`;
  
  // 概率预测 + 赔率
  html += `<div class="result-card">
    <h5>📈 概率预测</h5>
    <div class="prob-grid">
      <div class="prob-cell">
        <div class="pct">${(r.outcomes.homeWin * 100).toFixed(1)}%</div>
        <div class="lbl">主胜</div>
      </div>
      <div class="prob-cell">
        <div class="pct">${(r.outcomes.draw * 100).toFixed(1)}%</div>
        <div class="lbl">平局</div>
      </div>
      <div class="prob-cell">
        <div class="pct">${(r.outcomes.awayWin * 100).toFixed(1)}%</div>
        <div class="lbl">客胜</div>
      </div>
    </div>
    <div class="metric-row">
      <span class="label">预期总进球</span>
      <span class="value">${r.outcomes.totalGoals.toFixed(2)}</span>
    </div>
    <div class="metric-row">
      <span class="label">大球 (>2.5)</span>
      <span class="value">${(r.outcomes.over25 * 100).toFixed(1)}%</span>
    </div>
    <div class="metric-row">
      <span class="label">小球 (<2.5)</span>
      <span class="value">${(r.outcomes.under25 * 100).toFixed(1)}%</span>
    </div>
  </div>`;
  
  // 赔率与价值
  if (r.odds) {
    html += `<div class="result-card">
      <h5>🏦 赔率与价值</h5>`;
    
    const oddsData = [
      {label: '主胜', odds: r.odds.home, prob: r.outcomes.homeWin, value: r.kelly.valueHome, kelly: r.kelly.kellyHome},
      {label: '平局', odds: r.odds.draw, prob: r.outcomes.draw, value: r.kelly.valueDraw, kelly: r.kelly.kellyDraw},
      {label: '客胜', odds: r.odds.away, prob: r.outcomes.awayWin, value: r.kelly.valueAway, kelly: r.kelly.kellyAway},
    ];
    
    for (const item of oddsData) {
      const implied = oddsToImplied(item.odds);
      let valueTag = '';
      if (item.value > 1.1) valueTag = '<span class="value-badge value-strong">✅ 高价值</span>';
      else if (item.value > 1.05) valueTag = '<span class="value-badge value-good">✅ 有价</span>';
      else valueTag = '<span class="value-badge value-bad">❌</span>';
      
      const kellyTag = item.kelly > 0
        ? `${(item.kelly * 100).toFixed(2)}% <small>🟢 可投</small>`
        : '不投';
      
      html += `<div class="metric-row">
        <span class="label">${item.label} @ ${item.odds.toFixed(2)}</span>
        <span class="value">${valueTag} 模型${(item.prob * 100).toFixed(1)}% / 隐含${(implied * 100).toFixed(1)}% · 凯利 ${kellyTag}</span>
      </div>`;
    }
    
    if (r.odds.time) {
      html += `<div class="info-box">🕐 赔率截取于 ${r.odds.time}</div>`;
    }
    html += `</div>`;
  }
  
  // 比分概率矩阵（简化，显示前3*3）
  html += `<div class="result-card">
    <h5>📊 比分概率矩阵 (前3×3)</h5>
    <div class="score-matrix">
      <table>
        <tr><th>主\\客</th><th>0</th><th>1</th><th>2</th></tr>`;
  
  let maxProb = 0, maxKey = '';
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const key = `${i}-${j}`;
      if (r.matrix[key] > maxProb) { maxProb = r.matrix[key]; maxKey = key; }
    }
  }
  
  for (let i = 0; i <= 3; i++) {
    html += `<tr><th>${i}</th>`;
    for (let j = 0; j <= 3; j++) {
      const key = `${i}-${j}`;
      const p = r.matrix[key] || 0;
      const isHot = key === maxKey;
      html += `<td class="${isHot ? 'hot' : ''}">${(p * 100).toFixed(1)}%</td>`;
    }
    html += '</tr>';
  }
  
  html += `</table>
    </div>
    <small>📌 染色 = 最可能比分 (${(maxProb * 100).toFixed(1)}%)</small>
  </div>`;
  
  c.innerHTML = html;
}

function renderTeamCard(name, stat, label, isHome) {
  let html = `<div class="result-card">
    <h5>${isHome ? '🏠' : '✈️'} ${name}（${label}）</h5>
    <div class="metric-row">
      <span class="label">近5场</span>
      <span class="value">进 ${stat.avgRecentFor.toFixed(2)} / 失 ${stat.avgRecentAgainst.toFixed(2)}（${stat.recentCount}场）</span>
    </div>
    <div class="metric-row">
      <span class="label">赛季</span>
      <span class="value">进 ${stat.avgAllFor.toFixed(2)} / 失 ${stat.avgAllAgainst.toFixed(2)}（${stat.allCount}场）</span>
    </div>
    <div class="metric-row">
      <span class="label">进攻力 × 防守力</span>
      <span class="value">进攻 ${stat.attack.toFixed(3)} · 防守 ${stat.defense.toFixed(3)}</span>
    </div>`;
  
  // 最近比赛详情
  if (stat.recentMatches && stat.recentMatches.length > 0) {
    html += `<ul class="recent-list">
      <small style="display:block;color:var(--pico-muted-color);margin:0.3rem 0 0.15rem">最近比赛：</small>`;
    for (const m of stat.recentMatches.slice(0, 5)) {
      const date = m.date.slice(-5); // MM-DD
      const op = m.isHome ? m.team2 : m.team1;
      const score = m.isHome
        ? `${m.ft[0]}-${m.ft[1]}`
        : `${m.ft[1]}-${m.ft[0]}`;
      const status = m.won ? 'w' : (m.draw ? 'd' : 'l');
      const loc = m.isHome ? '主场' : '客场';
      const shortOp = op.length > 12 ? op.slice(0, 10) + '..' : op;
      html += `<li>
        <span class="date">${date}</span>
        <span class="opponent">${loc} ${shortOp}</span>
        <span class="score ${status}">${score} ${status === 'w' ? '胜' : status === 'd' ? '平' : '负'}</span>
      </li>`;
    }
    html += `</ul>`;
  }
  
  html += `</div>`;
  return html;
}

function showResultMessage(msg) {
  const el = $('resultContent');
  el.innerHTML = `<div class="info-box">${msg}</div>`;
}

// ============ 事件绑定 ============
function init() {
  initLeagueButtons();
  
  $('backToLeague').onclick = () => show('step1');
  $('homeTeam').onchange = onTeamChange;
  $('awayTeam').onchange = onTeamChange;
  $('analyzeBtn').onclick = onAnalyze;
  
  $('oddsAuto').onclick = onOddsAuto;
  $('oddsManual').onclick = () => {
    $('manualOdds').hidden = false;
    state.odds = null;
  };
  $('oddsSkip').onclick = () => {
    state.odds = null;
    doAnalysis();
  };
  $('submitManualOdds').onclick = () => {
    const h = parseFloat($('oddsHome').value);
    const d = parseFloat($('oddsDraw').value);
    const a = parseFloat($('oddsAway').value);
    if (!h || !d || !a) {
      showResultMessage('⚠️ 请完整输入三个赔率（欧赔）');
      return;
    }
    state.odds = {home: h, draw: d, away: a};
    doAnalysis();
  };
  $('newAnalysis').onclick = () => {
    state.odds = null;
    $('manualOdds').hidden = true;
    $('oddsHome').value = '';
    $('oddsDraw').value = '';
    $('oddsAway').value = '';
    show('step3');
  };
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await loadTeamMap();
  if (!ok) {
    document.body.innerHTML = '<div class="error-box" style="margin:2rem;padding:1rem;text-align:center">❌ 球队映射数据加载失败，请检查网络</div>';
    return;
  }
  init();
});
