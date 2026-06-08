// ============ 전역 상태 ============
let currentUser = null;
let currentPage = 'dashboard';
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

// ============ 유틸리티 ============
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '오류가 발생했습니다');
  return data;
}

function formatMoney(n) {
  return (n || 0).toLocaleString('ko-KR') + '원';
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function formatDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  return `${formatDate(d)} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function toggleMobileMenu() {
  document.getElementById('sidebar').classList.toggle('mobile-show');
}

// ============ 인증 ============
async function checkAuth() {
  try {
    const data = await api('/api/me');
    if (data.loggedIn) {
      currentUser = data;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = '아이디와 비밀번호를 입력하세요';
    return;
  }
  try {
    const data = await api('/api/login', { method: 'POST', body: { username, password } });
    currentUser = {
      loggedIn: true,
      role: data.role,
      displayName: data.displayName,
      freelancerId: data.freelancerId
    };
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function doLogout() {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  showLogin();
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('sidebarUserName').textContent = currentUser.displayName;
  const badge = document.getElementById('sidebarRole');
  badge.textContent = currentUser.role === 'admin' ? '관리자' : '프리랜서';
  badge.className = `role-badge ${currentUser.role}`;
  buildSidebar();
  navigateTo(currentUser.role === 'admin' ? 'dashboard' : 'my-status');
  startNotifCheck();
}

// ============ 사이드바 ============
function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  let items = [];

  if (currentUser.role === 'admin') {
    items = [
      { id: 'dashboard', icon: '📊', label: '대시보드' },
      { id: 'freelancers', icon: '👥', label: '프리랜서 관리' },
      { id: 'files', icon: '📁', label: '작업 파일 현황' },
      { id: 'calendar', icon: '📅', label: '캘린더' },
      { divider: true },
      { id: 'guild-cards', icon: '🃏', label: '길드 카드 거래' },
      { divider: true },
      { id: 'messages', icon: '💬', label: '메시지' },
      { id: 'logs', icon: '📋', label: '활동 로그' },
      { id: 'drive-settings', icon: '⚙️', label: '설정' },
      { id: 'change-pw', icon: '🔑', label: '비밀번호 변경' },
    ];
  } else {
    items = [
      { id: 'my-status', icon: '📊', label: '내 현황' },
      { id: 'calendar', icon: '📅', label: '캘린더' },
      { divider: true },
      { id: 'guild-cards', icon: '🃏', label: '길드 카드 거래' },
      { divider: true },
      { id: 'messages', icon: '💬', label: '메시지' },
      { id: 'change-pw', icon: '🔑', label: '비밀번호 변경' },
    ];
  }

  nav.innerHTML = items.map(item => {
    if (item.divider) return '<div class="nav-divider"></div>';
    return `<div class="nav-item" data-page="${item.id}" onclick="navigateTo('${item.id}')">
      <span class="icon">${item.icon}</span> ${item.label}
    </div>`;
  }).join('');
}

function navigateTo(page) {
  currentPage = page;
  // 사이드바 활성화 표시
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // 모바일 메뉴 닫기
  document.getElementById('sidebar').classList.remove('mobile-show');

  const main = document.getElementById('mainContent');
  // 프리랜서가 dashboard 접근 시 통합 페이지로
  if (page === 'dashboard' && currentUser.role !== 'admin') {
    page = 'my-status';
    currentPage = 'my-status';
  }
  switch (page) {
    case 'dashboard': renderDashboard(main); break;
    case 'my-status': renderMyStatus(main); break;
    case 'freelancers': renderFreelancers(main); break;
    case 'files': renderFiles(main); break;
    case 'settlement': renderDashboard(main); break;
    case 'yearly-report': renderDashboard(main); break;
    case 'analytics': renderDashboard(main); break;
    case 'messages': renderMessages(main); break;
    case 'logs': renderLogs(main); break;
    case 'calendar': renderCalendar(main); break;
    case 'drive-settings': renderDriveSettings(main); break;
    case 'change-pw': renderChangePassword(main); break;
    case 'guild-cards': renderGuildCards(main); break;
    default: main.innerHTML = '<p>페이지를 찾을 수 없습니다</p>';
  }
}

// ============ 대시보드 ============
async function renderDashboard(container) {
  container.innerHTML = '<p>로딩 중...</p>';
  try {
    const dash = await api('/api/dashboard');
    const now = new Date();
    const monthName = `${dash.year}년 ${dash.month}월`;

    if (currentUser.role === 'admin') {
      const [events, detail, adminNotifs] = await Promise.all([
        api(`/api/events?year=${now.getFullYear()}`),
        api('/api/dashboard-detail').catch(() => ({})),
        api('/api/notifications').catch(() => [])
      ]);
      const today = new Date();
      today.setHours(0,0,0,0);
      const upcoming = events
        .filter(e => new Date(e.event_date) >= today)
        .sort((a,b) => new Date(a.event_date) - new Date(b.event_date))
        .slice(0, 5);

      const unreadAdminNotifs = adminNotifs.filter(n => !n.is_read);
      let unreadCount = unreadAdminNotifs.length;

      const fileDiff = (detail.thisMonthFiles || 0) - (detail.lastMonthFiles || 0);
      const filePct = detail.lastMonthFiles > 0 ? Math.round((fileDiff / detail.lastMonthFiles) * 100) : 0;
      const totalDiff = (detail.thisMonthTotal || 0) - (detail.lastMonthTotal || 0);
      const todoCount = (detail.pendingFiles || 0) + (detail.unpaidCount || 0) + (detail.expiringContracts || 0);

      container.innerHTML = `
        <div class="page-header">
          <h1>대시보드 <span id="notifBadge" class="notif-badge" style="display:${unreadCount > 0 ? 'inline-flex' : 'none'}">${unreadCount}</span></h1>
          <div class="actions">
            <button class="btn btn-success btn-sm" style="white-space:nowrap;" onclick="syncAllDrive()">🔄 드라이브 동기화</button>
          </div>
        </div>

        <!-- 상단 요약 카드 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">👥</div>
            <div class="stat-info">
              <h4>활성 프리랜서</h4>
              <div class="value">${dash.totalFreelancers}명</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">📁</div>
            <div class="stat-info">
              <h4>${monthName} 작업 건수</h4>
              <div class="value">${dash.monthFiles}건</div>
              <div style="font-size:12px;margin-top:2px;color:${fileDiff >= 0 ? '#27ae60' : '#e74c3c'};">${fileDiff >= 0 ? '▲' : '▼'} 전월대비 ${Math.abs(fileDiff)}건 (${fileDiff >= 0 ? '+' : ''}${filePct}%)</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange">💰</div>
            <div class="stat-info">
              <h4>${monthName} 총 정산액</h4>
              <div class="value">${formatMoney(dash.monthTotal)}</div>
              <div style="font-size:12px;margin-top:2px;color:${totalDiff >= 0 ? '#27ae60' : '#e74c3c'};">${totalDiff >= 0 ? '▲' : '▼'} 전월대비 ${totalDiff >= 0 ? '+' : ''}${formatMoney(Math.abs(totalDiff))}</div>
            </div>
          </div>
        </div>

        ${todoCount > 0 ? `
        <div class="card" style="border-left:4px solid #f39c12;padding:16px 24px;">
          <div class="card-header" style="margin-bottom:12px;"><h3>⚡ 처리 필요</h3></div>
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            ${detail.pendingFiles > 0 ? `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="navigateTo('files')">
              <span style="background:#fef3e2;color:#f39c12;padding:6px 12px;border-radius:8px;font-weight:700;">${detail.pendingFiles}</span>
              <span style="font-size:14px;">미확인 파일</span></div>` : ''}
            ${detail.unpaidCount > 0 ? `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="dashTab('settle')">
              <span style="background:#fde8e8;color:#e74c3c;padding:6px 12px;border-radius:8px;font-weight:700;">${detail.unpaidCount}</span>
              <span style="font-size:14px;">미지급 정산</span></div>` : ''}
            ${detail.expiringContracts > 0 ? `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="navigateTo('freelancers')">
              <span style="background:#e8f4fd;color:#3498db;padding:6px 12px;border-radius:8px;font-weight:700;">${detail.expiringContracts}</span>
              <span style="font-size:14px;">만료 임박 계약</span></div>` : ''}
          </div>
        </div>` : ''}

        ${unreadAdminNotifs.length > 0 ? `
        <div class="card" style="border-left:4px solid #3498db;">
          <div class="card-header"><h3>🔔 새 알림 (${unreadAdminNotifs.length}건)</h3></div>
          ${unreadAdminNotifs.slice(0,5).map(n => `
            <div class="notif-item" onclick="goToNotification(${n.id}, '${n.link || ''}')" style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;cursor:pointer;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:16px;">${n.link === 'messages' ? '💬' : n.link === 'files' ? '📁' : n.link === 'settlement' ? '💰' : n.link === 'contracts' ? '📄' : '🔔'}</span>
                <div style="flex:1;">
                  <strong>${n.title}</strong> - ${n.message}
                  <div style="color:#999;font-size:12px;margin-top:2px;">${formatDateTime(n.created_at)}</div>
                </div>
                <span style="color:#3498db;font-size:12px;white-space:nowrap;">바로가기 →</span>
              </div>
            </div>
          `).join('')}
        </div>` : ''}

        <!-- 탭 네비게이션 -->
        <div style="display:flex;gap:0;border-bottom:2px solid #e0e0e0;margin-bottom:0;">
          <button class="dash-tab active" data-tab="overview" onclick="dashTab('overview')" style="padding:12px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;border-bottom:3px solid #302b63;color:#302b63;">📊 총괄</button>
          <button class="dash-tab" data-tab="settle" onclick="dashTab('settle')" style="padding:12px 20px;border:none;background:none;cursor:pointer;font-size:14px;color:#888;border-bottom:3px solid transparent;">💰 정산</button>
          <button class="dash-tab" data-tab="yearly" onclick="dashTab('yearly')" style="padding:12px 20px;border:none;background:none;cursor:pointer;font-size:14px;color:#888;border-bottom:3px solid transparent;">📈 연간</button>
          <button class="dash-tab" data-tab="compare" onclick="dashTab('compare')" style="padding:12px 20px;border:none;background:none;cursor:pointer;font-size:14px;color:#888;border-bottom:3px solid transparent;">📉 비교</button>
        </div>

        <!-- 탭 콘텐츠 -->
        <div id="dashTabContent"></div>
      `;

      // 기본: 총괄 탭
      dashTab('overview');
    } else {
      // 프리랜서 대시보드 (강화)
      let yearlyData = null;
      try { yearlyData = await api(`/api/yearly-report?year=${now.getFullYear()}`); } catch {}
      const flReport = yearlyData && yearlyData.report.length > 0 ? yearlyData.report[0] : null;
      const yearTotal = flReport ? flReport.yearTotal : 0;
      const yearAmount = flReport ? flReport.yearAmount : 0;

      // 알림 가져오기
      let notifs = [];
      try { notifs = await api('/api/notifications'); } catch {}
      const unreadNotifs = notifs.filter(n => !n.is_read);

      container.innerHTML = `
        <div class="page-header">
          <h1>안녕하세요, ${currentUser.displayName}님! <span id="notifBadge" class="notif-badge" style="display:${unreadNotifs.length > 0 ? 'inline-flex' : 'none'}">${unreadNotifs.length}</span></h1>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green">📁</div>
            <div class="stat-info">
              <h4>${monthName} 작업 건수</h4>
              <div class="value">${dash.monthFiles}건</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange">💰</div>
            <div class="stat-info">
              <h4>${monthName} 정산 예상액</h4>
              <div class="value">${formatMoney(dash.monthTotal)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">💵</div>
            <div class="stat-info">
              <h4>건당 단가</h4>
              <div class="value">${formatMoney(dash.unitPrice)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">📈</div>
            <div class="stat-info">
              <h4>${now.getFullYear()}년 누적 수입</h4>
              <div class="value">${formatMoney(yearAmount)}</div>
            </div>
          </div>
        </div>

        ${unreadNotifs.length > 0 ? `
        <div class="card" style="border-left:4px solid #3498db;">
          <div class="card-header"><h3>🔔 새 알림 (${unreadNotifs.length}건)</h3></div>
          ${unreadNotifs.slice(0,5).map(n => `
            <div class="notif-item" onclick="goToNotification(${n.id}, '${n.link || ''}')" style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;cursor:pointer;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:16px;">${n.link === 'messages' ? '💬' : n.link === 'files' ? '📁' : n.link === 'settlement' ? '💰' : n.link === 'contracts' ? '📄' : '🔔'}</span>
                <div style="flex:1;">
                  <strong>${n.title}</strong> - ${n.message}
                  <div style="color:#999;font-size:12px;margin-top:2px;">${formatDateTime(n.created_at)}</div>
                </div>
                <span style="color:#3498db;font-size:12px;white-space:nowrap;">바로가기 →</span>
              </div>
            </div>
          `).join('')}
        </div>` : ''}

        ${flReport ? `
        <div class="card">
          <div class="card-header"><h3>📊 ${now.getFullYear()}년 월별 작업량</h3></div>
          <div class="chart-container"><canvas id="flMonthlyChart" width="700" height="200"></canvas></div>
        </div>` : ''}
      `;

      // 프리랜서 월별 차트
      if (flReport) {
        setTimeout(() => {
          const canvas = document.getElementById('flMonthlyChart');
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          const W = canvas.width = canvas.parentElement.clientWidth || 700;
          const H = canvas.height = 200;
          ctx.clearRect(0, 0, W, H);
          const padL = 40, padR = 20, padT = 20, padB = 35;
          const cW = W - padL - padR, cH = H - padT - padB;
          const vals = [];
          for (let m = 1; m <= 12; m++) vals.push(flReport.months[m].count);
          const maxV = Math.max(...vals, 1);
          const bW = cW / 12;

          ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
          for (let i = 0; i <= 3; i++) {
            const y = padT + (cH / 3) * i;
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
            ctx.fillStyle = '#999'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxV - (maxV/3)*i), padL - 4, y + 4);
          }

          vals.forEach((v, i) => {
            const bH = (v / maxV) * cH;
            const x = padL + bW * i + bW * 0.2;
            const w = bW * 0.6;
            const y = padT + cH - bH;
            ctx.fillStyle = i === now.getMonth() ? '#f39c12' : '#3498db';
            ctx.fillRect(x, y, w, bH);
            ctx.fillStyle = '#666'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(`${i+1}월`, padL + bW * i + bW / 2, H - 6);
            if (v > 0) { ctx.fillStyle = '#333'; ctx.font = 'bold 11px Segoe UI'; ctx.fillText(v, padL + bW * i + bW / 2, y - 4); }
          });
        }, 100);
      }
    }
  } catch (e) {
    container.innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

async function loadDashSummary(year, month) {
  try {
    const data = await api(`/api/summary?year=${year}&month=${month}`);
    const el = document.getElementById('dashSummary');
    if (!el) return;
    if (data.summary.length === 0) {
      el.innerHTML = '<p style="color:#888;font-size:14px;">등록된 프리랜서가 없습니다</p>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>이름</th><th>건수</th><th>정산액</th></tr></thead>
        <tbody>
          ${data.summary.filter(s => s.active !== 0).map(s => `
            <tr>
              <td>${s.name}</td>
              <td class="text-center">${s.file_count}건</td>
              <td class="text-right money">${formatMoney(s.total_amount)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid #333;">
            <td>합계</td>
            <td class="text-center">${data.summary.reduce((s,r) => s + (r.active !== 0 ? r.file_count : 0), 0)}건</td>
            <td class="text-right money">${formatMoney(data.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } catch {}
}

// ============ 관리자 통합 대시보드 탭 ============
async function dashTab(tab) {
  // 탭 버튼 활성화
  document.querySelectorAll('.dash-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.style.borderBottomColor = isActive ? '#302b63' : 'transparent';
    btn.style.color = isActive ? '#302b63' : '#888';
    btn.style.fontWeight = isActive ? '600' : '400';
  });

  const content = document.getElementById('dashTabContent');
  if (!content) return;
  content.innerHTML = '<p style="padding:20px;">로딩 중...</p>';

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  if (tab === 'overview') {
    // 총괄: 일정 + 이번달 요약
    try {
      const [events] = await Promise.all([
        api(`/api/events?year=${y}`)
      ]);
      const today = new Date(); today.setHours(0,0,0,0);
      const upcoming = events.filter(e => new Date(e.event_date) >= today).sort((a,b) => new Date(a.event_date) - new Date(b.event_date)).slice(0,5);

      content.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;">
          <div class="card">
            <div class="card-header"><h3>📅 다가오는 일정</h3></div>
            ${upcoming.length === 0 ? '<p style="color:#888;font-size:14px;">예정된 일정이 없습니다</p>' :
              upcoming.map(e => {
                const eDate = new Date(e.event_date);
                const diff = Math.ceil((eDate - today) / (1000*60*60*24));
                const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
                return `<div class="upcoming-event">
                  <div class="date-box"><div class="month">${months[eDate.getMonth()]}</div><div class="day">${eDate.getDate()}</div></div>
                  <div class="event-info"><h4>${e.title}</h4><p>${e.description || ''}</p></div>
                  <div class="${diff === 0 ? 'dday-urgent' : diff <= 3 ? 'dday-soon' : 'dday-normal'}">${diff === 0 ? '🔥 D-DAY' : `D-${diff}`}</div>
                </div>`;
              }).join('')}
          </div>
          <div class="card">
            <div class="card-header"><h3>📊 이번 달 현황 요약</h3></div>
            <div id="dashSummary">로딩 중...</div>
          </div>
        </div>
      `;
      loadDashSummary(y, m);
    } catch (e) { content.innerHTML = `<p class="error-msg">${e.message}</p>`; }

  } else if (tab === 'settle') {
    // 정산 탭
    content.innerHTML = `
      <div style="margin-top:16px;">
        <div class="filter-bar" style="margin-bottom:16px;">
          <select id="settleYear" onchange="loadSettlement()">
            ${[2024,2025,2026,2027].map(yr => `<option value="${yr}" ${yr===y?'selected':''}>${yr}년</option>`).join('')}
          </select>
          <select id="settleMonth" onchange="loadSettlement()">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(mo => `<option value="${mo}" ${mo===m?'selected':''}>${mo}월</option>`).join('')}
          </select>
          <button class="btn btn-success btn-sm" style="white-space:nowrap;" onclick="downloadCSV()">📥 CSV</button>
          <button class="btn btn-primary btn-sm" style="white-space:nowrap;" onclick="openBatchInvoice()">🖨️ 일괄 인보이스</button>
        </div>
        <div class="card">
          <div class="table-container">
            <table>
              <thead><tr><th>프리랜서</th><th>건당 단가</th><th>이번 달 건수</th><th>지급 예정액</th><th>3.3% 원천세</th><th>실 지급액</th><th>지급상태</th><th>인보이스</th></tr></thead>
              <tbody id="settleTableBody"><tr><td colspan="8" class="text-center">로딩 중...</td></tr></tbody>
              <tfoot id="settleTableFoot"></tfoot>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>📝 월별 메모</h3></div>
          <div id="memoArea">로딩 중...</div>
        </div>
      </div>
    `;
    loadSettlement();

  } else if (tab === 'yearly') {
    // 연간 리포트 탭
    content.innerHTML = `
      <div style="margin-top:16px;">
        <div class="filter-bar" style="margin-bottom:16px;">
          <select id="reportYear" onchange="loadYearlyReport()">
            ${[2024,2025,2026,2027].map(yr => `<option value="${yr}" ${yr===y?'selected':''}>${yr}년</option>`).join('')}
          </select>
        </div>
        <div class="card">
          <div class="card-header"><h3>💰 연간 요약</h3></div>
          <div id="yearlySummaryArea">로딩 중...</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>📊 월별 작업량 추이</h3></div>
          <div id="yearlyLegendArea" style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px;padding:0 8px;"></div>
          <div class="chart-container"><canvas id="yearlyChart" width="800" height="300"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>📋 월별 상세 테이블</h3></div>
          <div class="table-container"><div id="yearlyTableArea">로딩 중...</div></div>
        </div>
      </div>
    `;
    loadYearlyReport();

  } else if (tab === 'compare') {
    // 비교 분석 탭
    content.innerHTML = `
      <div style="margin-top:16px;">
        <div class="filter-bar" style="margin-bottom:16px;">
          <select id="analyticsYear" onchange="loadAnalytics()">
            ${[2024,2025,2026,2027].map(yr => `<option value="${yr}" ${yr===y?'selected':''}>${yr}년</option>`).join('')}
          </select>
        </div>
        <div id="analyticsContent">로딩 중...</div>
      </div>
    `;
    loadAnalytics();
  }
}

// ============ 프리랜서 통합 현황 페이지 ============
async function renderMyStatus(container) {
  container.innerHTML = '<p>로딩 중...</p>';
  const now = new Date();
  try {
    const [dash, yearlyData, notifs] = await Promise.all([
      api('/api/dashboard'),
      api(`/api/yearly-report?year=${now.getFullYear()}`).catch(() => null),
      api('/api/notifications').catch(() => [])
    ]);
    const flReport = yearlyData && yearlyData.report.length > 0 ? yearlyData.report[0] : null;
    const yearAmount = flReport ? flReport.yearAmount : 0;
    const yearTotal = flReport ? flReport.yearTotal : 0;
    const unreadNotifs = notifs.filter(n => !n.is_read);
    const monthTax = Math.floor(dash.monthTotal * 0.033);
    const monthNet = dash.monthTotal - monthTax;
    const yearTax = Math.floor(yearAmount * 0.033);
    const yearNet = yearAmount - yearTax;

    container.innerHTML = `
      <div class="page-header">
        <h1>📊 내 현황 <span id="notifBadge" class="notif-badge" style="display:${unreadNotifs.length > 0 ? 'inline-flex' : 'none'}">${unreadNotifs.length}</span></h1>
      </div>

      ${unreadNotifs.length > 0 ? `
      <div class="card" style="border-left:4px solid #3498db;padding:16px 20px;">
        <strong>🔔 새 알림 (${unreadNotifs.length}건)</strong>
        ${unreadNotifs.slice(0,5).map(n => `
          <div class="notif-item" onclick="goToNotification(${n.id}, '${n.link || ''}')" style="padding:10px 12px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;cursor:pointer;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">${n.link === 'messages' ? '💬' : n.link === 'files' ? '📁' : n.link === 'settlement' ? '💰' : n.link === 'contracts' ? '📄' : '🔔'}</span>
              <div style="flex:1;">
                <strong>${n.title}</strong> - ${n.message}
                <div style="color:#999;font-size:11px;margin-top:2px;">${formatDateTime(n.created_at)}</div>
              </div>
              <span style="color:#3498db;font-size:12px;white-space:nowrap;">바로가기 →</span>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      <!-- 이번 달 요약 카드 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon green">📁</div>
          <div class="stat-info">
            <h4>${dash.month}월 작업 건수</h4>
            <div class="value">${dash.monthFiles}건</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orange">💰</div>
          <div class="stat-info">
            <h4>${dash.month}월 총액</h4>
            <div class="value">${formatMoney(dash.monthTotal)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">🏦</div>
          <div class="stat-info">
            <h4>${dash.month}월 원천세(3.3%)</h4>
            <div class="value" style="color:#e74c3c;">-${formatMoney(monthTax)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">💵</div>
          <div class="stat-info">
            <h4>${dash.month}월 실수령액</h4>
            <div class="value" style="color:#27ae60;">${formatMoney(monthNet)}</div>
          </div>
        </div>
      </div>

      <!-- 연간 누적 요약 -->
      <div class="card">
        <div class="card-header"><h3>📈 ${now.getFullYear()}년 연간 누적</h3></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:16px;text-align:center;">
          <div style="padding:16px;background:#f8f9fa;border-radius:10px;">
            <div style="font-size:13px;color:#888;">건당 단가</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatMoney(dash.unitPrice)}</div>
          </div>
          <div style="padding:16px;background:#f8f9fa;border-radius:10px;">
            <div style="font-size:13px;color:#888;">총 작업 건수</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">${yearTotal}건</div>
          </div>
          <div style="padding:16px;background:#f8f9fa;border-radius:10px;">
            <div style="font-size:13px;color:#888;">총 정산액</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">${formatMoney(yearAmount)}</div>
          </div>
          <div style="padding:16px;background:#f8f9fa;border-radius:10px;">
            <div style="font-size:13px;color:#888;">원천세 합계</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;color:#e74c3c;">-${formatMoney(yearTax)}</div>
          </div>
          <div style="padding:16px;background:#e8f8f0;border-radius:10px;">
            <div style="font-size:13px;color:#27ae60;">실수령 총액</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;color:#27ae60;">${formatMoney(yearNet)}</div>
          </div>
        </div>
      </div>

      <!-- 월별 그래프 -->
      ${flReport ? `
      <div class="card">
        <div class="card-header"><h3>📊 ${now.getFullYear()}년 월별 작업량</h3></div>
        <div class="chart-container"><canvas id="myStatusChart" width="800" height="220"></canvas></div>
      </div>` : ''}

      <!-- 월별 상세 테이블 -->
      ${flReport ? `
      <div class="card">
        <div class="card-header"><h3>📋 월별 상세</h3></div>
        <div class="table-container">
          <table>
            <thead><tr><th>월</th><th>작업 건수</th><th>총액</th><th>원천세(3.3%)</th><th>실수령액</th></tr></thead>
            <tbody>
              ${(() => {
                let rows = '';
                for (let m = 1; m <= 12; m++) {
                  const cnt = flReport.months[m].count;
                  const amt = flReport.months[m].amount;
                  const tax = Math.floor(amt * 0.033);
                  const net = amt - tax;
                  const isCurrent = m === now.getMonth() + 1;
                  rows += `<tr style="${isCurrent ? 'background:#e8f4fd;font-weight:600;' : ''} ${cnt === 0 ? 'color:#ccc;' : ''}">
                    <td>${m}월 ${isCurrent ? '👈' : ''}</td>
                    <td class="text-center">${cnt}건</td>
                    <td class="text-right money">${formatMoney(amt)}</td>
                    <td class="text-right" style="color:#e74c3c;">${cnt > 0 ? '-' + formatMoney(tax) : '-'}</td>
                    <td class="text-right money" style="color:#27ae60;">${cnt > 0 ? formatMoney(net) : '-'}</td>
                  </tr>`;
                }
                return rows;
              })()}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:3px solid #333;font-size:15px;">
                <td>합계</td>
                <td class="text-center">${yearTotal}건</td>
                <td class="text-right money">${formatMoney(yearAmount)}</td>
                <td class="text-right" style="color:#e74c3c;">-${formatMoney(yearTax)}</td>
                <td class="text-right money" style="color:#27ae60;">${formatMoney(yearNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>` : ''}

      <!-- 이번 달 파일 목록 -->
      <div class="card">
        <div class="card-header">
          <h3>📁 ${dash.month}월 내 작업 파일</h3>
          <select id="myStatusMonth" onchange="loadMyStatusFiles()" style="padding:6px 12px;border:2px solid #e0e0e0;border-radius:8px;font-size:13px;">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === now.getMonth()+1 ? 'selected' : ''}>${m}월</option>`).join('')}
          </select>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>파일명</th><th>업로드 일시</th><th>상태</th></tr></thead>
            <tbody id="myStatusFileBody"><tr><td colspan="3" class="text-center">로딩 중...</td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    // 차트 그리기
    if (flReport) {
      setTimeout(() => {
        const canvas = document.getElementById('myStatusChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.parentElement.clientWidth || 800;
        const H = canvas.height = 220;
        ctx.clearRect(0, 0, W, H);
        const padL = 40, padR = 20, padT = 20, padB = 35;
        const cW = W - padL - padR, cH = H - padT - padB;
        const vals = [];
        for (let m = 1; m <= 12; m++) vals.push(flReport.months[m].count);
        const maxV = Math.max(...vals, 1);
        const bW = cW / 12;

        // 그리드
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = padT + (cH / 4) * i;
          ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
          ctx.fillStyle = '#999'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'right';
          ctx.fillText(Math.round(maxV - (maxV/4)*i), padL - 4, y + 4);
        }

        // 막대
        vals.forEach((v, i) => {
          const bH = (v / maxV) * cH;
          const x = padL + bW * i + bW * 0.15;
          const w = bW * 0.7;
          const y = padT + cH - bH;
          const isCurrent = i === now.getMonth();
          // 그라디언트
          if (v > 0) {
            const grad = ctx.createLinearGradient(x, y, x, padT + cH);
            grad.addColorStop(0, isCurrent ? '#f39c12' : '#3498db');
            grad.addColorStop(1, isCurrent ? '#e67e22' : '#2980b9');
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = '#eee';
          }
          ctx.beginPath();
          ctx.roundRect(x, y, w, bH, [4, 4, 0, 0]);
          ctx.fill();
          // 라벨
          ctx.fillStyle = isCurrent ? '#e67e22' : '#666';
          ctx.font = isCurrent ? 'bold 12px Segoe UI' : '11px Segoe UI';
          ctx.textAlign = 'center';
          ctx.fillText(`${i+1}월`, padL + bW * i + bW / 2, H - 6);
          if (v > 0) {
            ctx.fillStyle = '#333'; ctx.font = 'bold 12px Segoe UI';
            ctx.fillText(v, padL + bW * i + bW / 2, y - 6);
          }
        });
      }, 100);
    }

    // 파일 목록 로드
    loadMyStatusFiles();
  } catch (e) {
    container.innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

async function loadMyStatusFiles() {
  const month = document.getElementById('myStatusMonth')?.value || (new Date().getMonth() + 1);
  const year = new Date().getFullYear();
  const tbody = document.getElementById('myStatusFileBody');
  if (!tbody) return;
  try {
    const files = await api(`/api/files?year=${year}&month=${month}`);
    if (files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#888;">이 달 작업 파일이 없습니다</td></tr>';
      return;
    }
    const statusLabels = { pending: '대기', reviewed: '확인완료', rejected: '반려' };
    const statusClass = { pending: 'status-pending', reviewed: 'status-reviewed', rejected: 'status-rejected' };
    tbody.innerHTML = files.map(f => {
      const st = f.status || 'pending';
      return `<tr>
        <td title="${f.file_name}">${f.file_name}</td>
        <td>${formatDateTime(f.uploaded_at)}</td>
        <td><span class="file-status-badge ${statusClass[st]}">${statusLabels[st]}</span></td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="error-msg">${e.message}</td></tr>`;
  }
}

// ============ 프리랜서 관리 (관리자만) ============
async function renderFreelancers(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>프리랜서 관리</h1>
      <div class="actions">
        <button class="btn btn-success" onclick="openAddFreelancer()">+ 프리랜서 추가</button>
      </div>
    </div>
    <div class="card">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>이름</th><th>아이디</th><th>이메일</th><th>전화번호</th>
              <th>건당 단가</th><th>드라이브</th><th>상태</th><th>관리</th>
            </tr>
          </thead>
          <tbody id="freelancerTableBody">
            <tr><td colspan="8" class="text-center">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  try {
    const list = await api('/api/freelancers');
    const tbody = document.getElementById('freelancerTableBody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="color:#888;">등록된 프리랜서가 없습니다. "프리랜서 추가" 버튼을 눌러 추가하세요.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(f => `
      <tr>
        <td><strong>${f.name}</strong></td>
        <td>${f.username || '-'}</td>
        <td>${f.email || '-'}</td>
        <td>${f.phone || '-'}</td>
        <td class="text-right money">${formatMoney(f.unit_price)}</td>
        <td>${f.drive_folder_url ? '<span style="color:#27ae60">✓ 연결됨</span>' : '<span style="color:#888">미설정</span>'}</td>
        <td>${f.active ? '<span class="status-active">활성</span>' : '<span class="status-inactive">비활성</span>'}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" style="min-width:56px;white-space:nowrap;padding:6px 10px;font-size:12px;text-align:center;" onclick="openEditFreelancer(${f.id})">수정</button>
            <button class="btn btn-sm" style="min-width:56px;white-space:nowrap;padding:6px 10px;font-size:12px;text-align:center;background:#302b63;color:#fff;" onclick="openContractDoc(${f.id}, '${f.name}')">계약서</button>
            <button class="btn btn-sm" style="min-width:46px;white-space:nowrap;padding:6px 10px;font-size:12px;text-align:center;background:#6c5ce7;color:#fff;" onclick="openContractHistory(${f.id}, '${f.name}')">이력</button>
            <button class="btn btn-warning btn-sm" style="min-width:76px;white-space:nowrap;padding:6px 10px;font-size:12px;text-align:center;" onclick="resetFreelancerPw(${f.id}, '${f.name}')">PW초기화</button>
            <button class="btn btn-danger btn-sm" style="min-width:56px;white-space:nowrap;padding:6px 10px;font-size:12px;text-align:center;" onclick="deleteFreelancer(${f.id}, '${f.name}')">삭제</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    document.getElementById('freelancerTableBody').innerHTML = `<tr><td colspan="8" class="error-msg">${e.message}</td></tr>`;
  }
}

async function openAddFreelancer() {
  document.getElementById('freelancerModalTitle').textContent = '프리랜서 추가';
  document.getElementById('editFreelancerId').value = '';
  document.getElementById('flName').value = '';
  document.getElementById('flUsername').value = '';
  document.getElementById('flPassword').value = '';
  document.getElementById('flEmail').value = '';
  document.getElementById('flPhone').value = '';
  document.getElementById('flUnitPrice').value = '';
  document.getElementById('flDriveUrl').value = '';
  document.getElementById('flMemo').value = '';
  // 기본 영상 확장자 자동 채우기
  try {
    const extData = await api('/api/settings/default-extensions');
    document.getElementById('flExtensions').value = extData.extensions || '.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm,.m4v,.mpg,.mpeg,.mp3,.wav,.aac,.flac,.ogg,.wma';
  } catch {
    document.getElementById('flExtensions').value = '.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm,.m4v,.mpg,.mpeg,.mp3,.wav,.aac,.flac,.ogg,.wma';
  }
  // 추가 모드에서는 아이디/비번 필드 표시
  document.getElementById('flUsername').closest('.form-group').style.display = '';
  document.getElementById('flPassword').closest('.form-group').style.display = '';
  openModal('freelancerModal');
}

async function openEditFreelancer(id) {
  try {
    const list = await api('/api/freelancers');
    const f = list.find(x => x.id === id);
    if (!f) return;
    document.getElementById('freelancerModalTitle').textContent = '프리랜서 수정';
    document.getElementById('editFreelancerId').value = f.id;
    document.getElementById('flName').value = f.name;
    document.getElementById('flUsername').value = f.username || '';
    document.getElementById('flPassword').value = '';
    document.getElementById('flEmail').value = f.email || '';
    document.getElementById('flPhone').value = f.phone || '';
    document.getElementById('flUnitPrice').value = f.unit_price;
    document.getElementById('flDriveUrl').value = f.drive_folder_url || '';
    document.getElementById('flExtensions').value = f.file_extensions || '';
    document.getElementById('flMemo').value = f.memo || '';
    // 수정 모드에서는 아이디/비번 필드 숨김
    document.getElementById('flUsername').closest('.form-group').style.display = 'none';
    document.getElementById('flPassword').closest('.form-group').style.display = 'none';
    openModal('freelancerModal');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveFreelancer() {
  const id = document.getElementById('editFreelancerId').value;
  const body = {
    name: document.getElementById('flName').value.trim(),
    email: document.getElementById('flEmail').value.trim(),
    phone: document.getElementById('flPhone').value.trim(),
    unit_price: parseInt(document.getElementById('flUnitPrice').value) || 0,
    drive_folder_url: document.getElementById('flDriveUrl').value.trim(),
    file_extensions: document.getElementById('flExtensions').value.trim(),
    memo: document.getElementById('flMemo').value.trim()
  };

  if (!body.name) { showToast('이름을 입력하세요', 'error'); return; }

  try {
    if (id) {
      await api(`/api/freelancers/${id}`, { method: 'PUT', body });
      showToast('프리랜서 정보가 수정되었습니다', 'success');
    } else {
      body.username = document.getElementById('flUsername').value.trim();
      body.password = document.getElementById('flPassword').value || '1234';
      const result = await api('/api/freelancers', { method: 'POST', body });
      showToast(`프리랜서가 추가되었습니다 (아이디: ${result.username})`, 'success');
    }
    closeModal('freelancerModal');
    renderFreelancers(document.getElementById('mainContent'));
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetFreelancerPw(id, name) {
  const newPw = prompt(`${name}님의 비밀번호를 초기화합니다.\n새 비밀번호를 입력하세요:`, '1234');
  if (!newPw) return;
  try {
    await api(`/api/freelancers/${id}/reset-password`, { method: 'POST', body: { newPassword: newPw } });
    showToast(`${name}님의 비밀번호가 초기화되었습니다`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteFreelancer(id, name) {
  if (!confirm(`정말 ${name}님을 삭제하시겠습니까?\n관련 파일 기록도 모두 삭제됩니다.`)) return;
  try {
    await api(`/api/freelancers/${id}`, { method: 'DELETE' });
    showToast(`${name}님이 삭제되었습니다`, 'success');
    renderFreelancers(document.getElementById('mainContent'));
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 계약서 작성/출력 ============
async function openContractDoc(freelancerId, freelancerName) {
  // 갑 정보 불러오기 (이전에 저장된 값)
  let companyInfo = {};
  try { companyInfo = await api('/api/settings/company-info'); } catch {}

  // 프리랜서 상세정보 불러오기
  let fl = {};
  try {
    const list = await api('/api/freelancers');
    fl = list.find(f => f.id === freelancerId) || {};
  } catch {}

  // 계약 정보 불러오기
  let contracts = [];
  try { contracts = await api(`/api/contracts?freelancer_id=${freelancerId}`); } catch {}
  const latestContract = contracts.length > 0 ? contracts[0] : {};

  const todayStr = new Date().toISOString().split('T')[0];

  // 기존 모달 제거
  document.getElementById('contractDocModal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'contractDocModal';
  overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;justify-content:center;align-items:center;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:680px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);padding:0;">
      <div style="position:sticky;top:0;background:#302b63;color:#fff;padding:18px 24px;border-radius:16px 16px 0 0;z-index:1;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:18px;color:#fff;">📋 업무위탁계약서 작성 - ${freelancerName}</h2>
        <button onclick="document.getElementById('contractDocModal').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;">✕</button>
      </div>
      <div style="padding:24px;">
        <!-- 갑(위탁자) 정보 -->
        <div style="background:#f8f6ff;padding:16px;border-radius:10px;margin-bottom:16px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#302b63;">📌 위탁자 (갑) 정보</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group" style="margin:0"><label style="font-size:12px;">대표자</label><input type="text" id="cdCompanyCeo" value="${companyInfo.company_ceo || ''}" placeholder="대표자명"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">연락처</label><input type="text" id="cdCompanyPhone" value="${companyInfo.company_phone || ''}" placeholder="010-0000-0000"></div>
          </div>
        </div>

        <!-- 을(수탁자) 정보 -->
        <div style="background:#f0f8f0;padding:16px;border-radius:10px;margin-bottom:16px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#27ae60;">👤 수탁자 (을)</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group" style="margin:0"><label style="font-size:12px;">성명</label><input type="text" id="cdFlName" value="${fl.name || ''}" placeholder="수탁자 성명"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">생년월일</label><input type="text" id="cdFlBirth" placeholder="YYYY-MM-DD"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">연락처</label><input type="text" id="cdFlPhone" value="${fl.phone || ''}" placeholder="연락처"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">이메일</label><input type="text" id="cdFlEmail" value="${fl.email || ''}" placeholder="이메일"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">입금 은행</label><input type="text" id="cdFlBank" placeholder="은행명 (예: 국민은행)"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">계좌번호</label><input type="text" id="cdFlAccount" placeholder="계좌번호"></div>
          </div>
        </div>

        <!-- 계약 정보 -->
        <div style="background:#f0f4f8;padding:16px;border-radius:10px;margin-bottom:16px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#2980b9;">📅 계약 정보</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div class="form-group" style="margin:0"><label style="font-size:12px;">계약일자</label><input type="date" id="cdContractDate" value="${todayStr}"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">업무시작일</label><input type="date" id="cdWorkStart" value="${latestContract.start_date || todayStr}"></div>
            <div class="form-group" style="margin:0"><label style="font-size:12px;">계약종료일</label><input type="date" id="cdContractEnd" value="${latestContract.end_date || ''}"></div>
          </div>
          <div class="form-group" style="margin:10px 0 0">
            <label style="font-size:12px;">건당 단가 (원)</label>
            <input type="number" id="cdUnitPrice" value="${latestContract.unit_price || fl.unit_price || 0}" placeholder="건당 단가">
          </div>
        </div>

        <!-- 업무 협의사항 -->
        <div style="background:#fff8f0;padding:16px;border-radius:10px;margin-bottom:16px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#e67e22;">📝 업무 협의사항</h3>
          <textarea id="cdWorkTerms" rows="6" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-size:12.5px;box-sizing:border-box;line-height:1.8;">1일 1영상 제작을 기본으로 하며, 1주일 기준 최소 7건 이상 작업
정산은 매월 1일에 진행
원천징수세 3.3% 공제 후 지정 계좌로 입금
작업물은 CAPCUT 프로젝트 공유 또는 Google Drive 지정 경로에 업로드
1일 1영상 필수이며, 초과 진행 희망 시 사전 협의 후 진행
작업물 납품 후 수정 요청 시 1회 무상 수정, 이후 추가 비용 협의</textarea>
          <small style="color:#888;font-size:11px;">한 줄에 하나씩 작성하세요. 계약서에 번호 매겨 자동 삽입됩니다.</small>
        </div>

        <!-- 특약사항 -->
        <div style="background:#f0f0f5;padding:16px;border-radius:10px;margin-bottom:16px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#8e44ad;">⚖️ 특약사항</h3>
          <textarea id="cdSpecialTerms" rows="4" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-size:12.5px;box-sizing:border-box;line-height:1.8;">을은 업무 수행 중 알게 된 갑의 영업 비밀 및 기밀 정보를 제3자에게 누설하지 않는다.
을이 제작한 작업물의 저작권은 납품 완료 시점부터 갑에게 귀속된다.
계약 기간 중 해지를 원할 경우 최소 14일 전 서면 통보하여야 한다.
갑과 을은 본 계약에 명시되지 않은 사항에 대해 상호 협의하여 결정한다.</textarea>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:8px;">
          <button class="btn" style="background:#888;color:#fff;padding:10px 24px;" onclick="document.getElementById('contractDocModal').remove()">닫기</button>
          <button class="btn" style="background:#302b63;color:#fff;padding:10px 24px;font-weight:600;" onclick="generateContractDoc(${freelancerId})">📄 계약서 생성 (PDF)</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function generateContractDoc(freelancerId) {
  // 갑 정보 저장 (다음에도 재사용)
  const companyInfo = {
    company_ceo: document.getElementById('cdCompanyCeo').value.trim(),
    company_phone: document.getElementById('cdCompanyPhone').value.trim()
  };
  try { await api('/api/settings/company-info', { method: 'POST', body: companyInfo }); } catch {}

  // 업무 협의사항 파싱
  const workTerms = document.getElementById('cdWorkTerms').value.split('\n').map(l => l.trim()).filter(l => l);
  const specialTerms = document.getElementById('cdSpecialTerms').value.split('\n').map(l => l.trim()).filter(l => l);

  const body = {
    freelancer_id: freelancerId,
    ...companyInfo,
    fl_name: document.getElementById('cdFlName').value.trim(),
    fl_phone: document.getElementById('cdFlPhone').value.trim(),
    fl_email: document.getElementById('cdFlEmail').value.trim(),
    fl_birthdate: document.getElementById('cdFlBirth').value.trim(),
    fl_bank: document.getElementById('cdFlBank').value.trim(),
    fl_account: document.getElementById('cdFlAccount').value.trim(),
    contract_date: document.getElementById('cdContractDate').value,
    work_start_date: document.getElementById('cdWorkStart').value,
    contract_end_date: document.getElementById('cdContractEnd').value,
    unit_price_input: parseInt(document.getElementById('cdUnitPrice').value) || 0,
    work_terms: workTerms,
    special_terms: specialTerms
  };

  // DB에 이력 저장 + 새 창에서 계약서 열기
  try {
    // 이력 저장
    await api('/api/contract-documents', { method: 'POST', body: { freelancer_id: freelancerId, form_data: body } });

    // 계약서 HTML 생성 + 새 창 열기
    const res = await fetch('/api/contract-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const html = await res.text();
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    showToast('계약서가 생성/저장되었습니다.', 'success');
    document.getElementById('contractDocModal')?.remove();
  } catch (e) {
    showToast('계약서 생성 실패: ' + e.message, 'error');
  }
}

// 저장된 계약서 재출력
async function reprintContractDoc(docId) {
  try {
    const docs = await api('/api/contract-documents');
    const doc = docs.find(d => d.id === docId);
    if (!doc) { showToast('계약서를 찾을 수 없습니다', 'error'); return; }
    const res = await fetch('/api/contract-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc.form_data)
    });
    const html = await res.text();
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  } catch (e) {
    showToast('계약서 출력 실패: ' + e.message, 'error');
  }
}

async function deleteContractDoc(docId, freelancerId, freelancerName) {
  if (!confirm('이 계약서 이력을 삭제하시겠습니까?')) return;
  try {
    await api(`/api/contract-documents/${docId}`, { method: 'DELETE' });
    showToast('삭제되었습니다', 'success');
    // 이력 모달 새로고침
    document.getElementById('contractHistoryModal')?.remove();
    openContractHistory(freelancerId, freelancerName);
  } catch (e) { showToast(e.message, 'error'); }
}

async function openContractHistory(freelancerId, freelancerName) {
  document.getElementById('contractHistoryModal')?.remove();

  let docs = [];
  try { docs = await api(`/api/contract-documents?freelancer_id=${freelancerId}`); } catch {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'contractHistoryModal';
  overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;justify-content:center;align-items:center;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:600px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);padding:0;">
      <div style="position:sticky;top:0;background:#6c5ce7;color:#fff;padding:18px 24px;border-radius:16px 16px 0 0;z-index:1;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:18px;color:#fff;">📄 계약서 이력 - ${freelancerName}</h2>
        <button onclick="document.getElementById('contractHistoryModal').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;">✕</button>
      </div>
      <div style="padding:24px;">
        ${docs.length === 0 ? `
          <div style="text-align:center;padding:40px 0;color:#888;">
            <div style="font-size:40px;margin-bottom:12px;">📋</div>
            <p>작성된 계약서가 없습니다.</p>
            <button class="btn" style="background:#302b63;color:#fff;margin-top:16px;padding:10px 24px;" onclick="document.getElementById('contractHistoryModal').remove(); openContractDoc(${freelancerId}, '${freelancerName}')">+ 새 계약서 작성</button>
          </div>
        ` : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #e0e0e0;">
                <th style="padding:10px 8px;text-align:left;font-size:13px;">작성일</th>
                <th style="padding:10px 8px;text-align:left;font-size:13px;">계약기간</th>
                <th style="padding:10px 8px;text-align:right;font-size:13px;">단가</th>
                <th style="padding:10px 8px;text-align:center;font-size:13px;">관리</th>
              </tr>
            </thead>
            <tbody>
              ${docs.map(d => {
                const fd = d.form_data;
                return `<tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:10px 8px;font-size:13px;">${d.created_at ? d.created_at.substring(0, 10) : '-'}</td>
                  <td style="padding:10px 8px;font-size:13px;">${fd.work_start_date || '-'} ~ ${fd.contract_end_date || '-'}</td>
                  <td style="padding:10px 8px;font-size:13px;text-align:right;">${(fd.unit_price_input || 0).toLocaleString()}원</td>
                  <td style="padding:10px 8px;text-align:center;">
                    <div style="display:flex;gap:6px;justify-content:center;">
                      <button class="btn btn-sm" style="background:#302b63;color:#fff;padding:5px 12px;font-size:12px;white-space:nowrap;" onclick="reprintContractDoc(${d.id})">출력</button>
                      <button class="btn btn-sm" style="background:#e74c3c;color:#fff;padding:5px 12px;font-size:12px;white-space:nowrap;" onclick="deleteContractDoc(${d.id}, ${freelancerId}, '${freelancerName}')">삭제</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div style="text-align:center;margin-top:20px;">
            <button class="btn" style="background:#302b63;color:#fff;padding:10px 24px;" onclick="document.getElementById('contractHistoryModal').remove(); openContractDoc(${freelancerId}, '${freelancerName}')">+ 새 계약서 작성</button>
          </div>
        `}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ============ 파일 현황 ============
async function renderFiles(container) {
  const now = new Date();
  const isAdmin = currentUser.role === 'admin';

  container.innerHTML = `
    <div class="page-header">
      <h1>${isAdmin ? '작업 파일 현황' : '내 작업 현황'}</h1>
      ${isAdmin ? '<div class="actions"><button class="btn btn-success" style="white-space:nowrap;" onclick="openAddFile()">+ 수동 등록</button><button class="btn btn-primary" style="white-space:nowrap;margin-left:8px;" onclick="syncAllDrive()">🔄 동기화</button></div>' : ''}
    </div>

    <div class="filter-bar">
      <select id="filterYear" onchange="loadFiles()">
        ${[2024,2025,2026,2027].map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}년</option>`).join('')}
      </select>
      <select id="filterMonth" onchange="loadFiles()">
        <option value="">전체 월</option>
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === now.getMonth()+1 ? 'selected' : ''}>${m}월</option>`).join('')}
      </select>
      ${isAdmin ? '<select id="filterFreelancer" onchange="loadFiles()"><option value="">전체 프리랜서</option></select>' : ''}
    </div>

    <div class="card">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              ${isAdmin ? '<th>프리랜서</th>' : ''}
              <th>파일명</th><th>작성자</th><th>업로드 일시</th><th>상태</th>
              ${isAdmin ? '<th>태그</th>' : ''}
              <th>관리</th>
            </tr>
          </thead>
          <tbody id="fileTableBody">
            <tr><td colspan="5" class="text-center">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (isAdmin) {
    // 프리랜서 필터 드롭다운 채우기
    try {
      const list = await api('/api/freelancers');
      const sel = document.getElementById('filterFreelancer');
      list.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        sel.appendChild(opt);
      });
    } catch {}
  }
  loadFiles();
}

async function loadFiles() {
  const year = document.getElementById('filterYear').value;
  const month = document.getElementById('filterMonth').value;
  const flId = document.getElementById('filterFreelancer')?.value || '';
  const isAdmin = currentUser.role === 'admin';

  let url = `/api/files?year=${year}`;
  if (month) url += `&month=${month}`;
  if (flId) url += `&freelancer_id=${flId}`;

  try {
    const files = await api(url);
    const tbody = document.getElementById('fileTableBody');
    if (files.length === 0) {
      const cols = isAdmin ? 5 : 3;
      tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center" style="color:#888;">해당 기간의 파일이 없습니다</td></tr>`;
      return;
    }
    tbody.innerHTML = files.map(f => {
      const status = f.status || 'pending';
      const statusLabels = { pending: '대기', reviewed: '확인완료', rejected: '반려' };
      const statusClass = { pending: 'status-pending', reviewed: 'status-reviewed', rejected: 'status-rejected' };
      return `
      <tr>
        ${isAdmin ? `<td>${f.freelancer_name}</td>` : ''}
        <td class="truncate" title="${f.file_name}">${f.file_name}</td>
        <td>${f.uploader_name || '-'}</td>
        <td>${formatDateTime(f.uploaded_at)}</td>
        <td>
          <span class="file-status-badge ${statusClass[status]}">${statusLabels[status]}</span>
          ${isAdmin ? `
            <div class="status-btns">
              ${status !== 'reviewed' ? `<button class="btn-tag btn-tag-green" onclick="updateFileStatus(${f.id}, 'reviewed')">✓</button>` : ''}
              ${status !== 'rejected' ? `<button class="btn-tag btn-tag-red" onclick="updateFileStatus(${f.id}, 'rejected')">✗</button>` : ''}
              ${status !== 'pending' ? `<button class="btn-tag btn-tag-gray" onclick="updateFileStatus(${f.id}, 'pending')">↺</button>` : ''}
            </div>
          ` : ''}
        </td>
        ${isAdmin ? `<td style="max-width:100px;">
          <span class="file-tag" style="cursor:pointer;font-size:12px;color:${f.tag ? '#3498db' : '#ccc'};" onclick="editFileTag(${f.id})" title="클릭하여 태그 수정">${f.tag || '태그 없음'}</span>
        </td>` : ''}
        <td>
          <div class="flex gap-8">
            <button class="btn btn-secondary btn-sm" onclick="openFileComments(${f.id}, '${f.file_name.replace(/'/g,"\\'").substring(0,30)}')">💬</button>
            ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteFile(${f.id})">삭제</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    document.getElementById('fileTableBody').innerHTML = `<tr><td colspan="5" class="error-msg">${e.message}</td></tr>`;
  }
}

async function openAddFile() {
  try {
    const list = await api('/api/freelancers');
    const sel = document.getElementById('fileFreelancerId');
    sel.innerHTML = list.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    document.getElementById('fileName').value = '';
    document.getElementById('fileUploader').value = '';
    document.getElementById('fileDate').value = new Date().toISOString().slice(0, 16);
    openModal('fileModal');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveFile() {
  const body = {
    freelancer_id: document.getElementById('fileFreelancerId').value,
    file_name: document.getElementById('fileName').value.trim(),
    uploader_name: document.getElementById('fileUploader').value.trim(),
    uploaded_at: document.getElementById('fileDate').value
  };
  if (!body.file_name) { showToast('파일명을 입력하세요', 'error'); return; }
  try {
    await api('/api/files', { method: 'POST', body });
    showToast('파일이 등록되었습니다', 'success');
    closeModal('fileModal');
    loadFiles();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteFile(id) {
  if (!confirm('이 파일 기록을 삭제하시겠습니까?')) return;
  try {
    await api(`/api/files/${id}`, { method: 'DELETE' });
    showToast('삭제되었습니다', 'success');
    loadFiles();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 정산 관리 (CSV 다운로드 + 메모 기능 포함) ============
async function loadSettlement() {
  const year = document.getElementById('settleYear').value;
  const month = document.getElementById('settleMonth').value;
  const isAdmin = currentUser.role === 'admin';

  try {
    const data = await api(`/api/summary?year=${year}&month=${month}`);
    const tbody = document.getElementById('settleTableBody');
    const tfoot = document.getElementById('settleTableFoot');

    if (data.summary.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#888;">데이터가 없습니다</td></tr>`;
      tfoot.innerHTML = '';
      if (isAdmin) loadMemos(year, month, []);
      return;
    }

    const activeSummary = data.summary.filter(s => s.active !== 0);
    const payMap = isAdmin ? await loadPaymentStatus(year, month, activeSummary) : {};
    tbody.innerHTML = activeSummary.map(s => {
      const tax = Math.floor(s.total_amount * 0.033);
      const net = s.total_amount - tax;
      const pay = payMap[s.id];
      const isPaid = pay && pay.status === 'paid';
      return `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td class="text-right money">${formatMoney(s.unit_price)}</td>
          <td class="text-center"><strong>${s.file_count}건</strong></td>
          <td class="text-right money">${formatMoney(s.total_amount)}</td>
          ${isAdmin ? `<td class="text-right money" style="color:#e74c3c;">-${formatMoney(tax)}</td>` : ''}
          ${isAdmin ? `<td class="text-right money" style="color:#27ae60;font-size:16px;"><strong>${formatMoney(net)}</strong></td>` : ''}
          ${isAdmin ? `<td class="text-center">${isPaid ?
            `<span class="pay-badge pay-paid">✓ 지급완료</span><div style="font-size:11px;color:#888;margin-top:2px;">${pay.paid_at ? pay.paid_at.substring(0,10) : ''}</div>` :
            `<button class="btn btn-success btn-sm" onclick="markAsPaid(${s.id},'${year}','${month}')">💳 지급처리</button>`
          }</td>` : ''}
          ${isAdmin ? `<td class="text-center"><button class="btn btn-secondary btn-sm" onclick="openInvoice(${s.id},'${year}','${month}')">📄</button></td>` : ''}
        </tr>
      `;
    }).join('');

    if (isAdmin) {
      const totalAmount = activeSummary.reduce((s,r) => s + r.total_amount, 0);
      const totalTax = Math.floor(totalAmount * 0.033);
      const totalNet = totalAmount - totalTax;
      const totalFiles = activeSummary.reduce((s,r) => s + r.file_count, 0);
      tfoot.innerHTML = `
        <tr style="font-weight:700;border-top:3px solid #333;font-size:15px;">
          <td>합계</td>
          <td></td>
          <td class="text-center">${totalFiles}건</td>
          <td class="text-right money">${formatMoney(totalAmount)}</td>
          <td class="text-right money" style="color:#e74c3c;">-${formatMoney(totalTax)}</td>
          <td class="text-right money" style="color:#27ae60;">${formatMoney(totalNet)}</td>
        </tr>
      `;
      loadMemos(year, month, activeSummary);
    }
  } catch (e) {
    document.getElementById('settleTableBody').innerHTML = `<tr><td colspan="6" class="error-msg">${e.message}</td></tr>`;
  }
}

// ============ 캘린더 ============
async function renderCalendar(container) {
  const isAdmin = currentUser.role === 'admin';
  container.innerHTML = `
    <div class="page-header">
      <h1>캘린더</h1>
      ${isAdmin ? '<div class="actions"><button class="btn btn-success" onclick="openAddEvent()">+ 일정 추가</button></div>' : ''}
    </div>
    <div class="card">
      <div class="calendar-nav">
        <button onclick="changeMonth(-1)">◀</button>
        <h2 id="calendarTitle"></h2>
        <button onclick="changeMonth(1)">▶</button>
        <button class="btn btn-sm btn-secondary" onclick="goToday()" style="margin-left:12px;">오늘</button>
      </div>
      <div class="calendar-grid" id="calendarGrid"></div>
    </div>
    ${isAdmin ? `<div class="card mt-16" id="eventListCard">
      <div class="card-header"><h3>📋 이번 달 일정 목록</h3></div>
      <div id="eventList"></div>
    </div>` : ''}
  `;
  buildCalendar();
}

function changeMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  buildCalendar();
}

function goToday() {
  calendarYear = new Date().getFullYear();
  calendarMonth = new Date().getMonth();
  buildCalendar();
}

async function buildCalendar() {
  const title = document.getElementById('calendarTitle');
  if (!title) return;
  title.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

  try {
    const events = await api(`/api/events?year=${calendarYear}`);
    const grid = document.getElementById('calendarGrid');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = new Date();

    let html = dayNames.map(d => `<div class="calendar-header">${d}</div>`).join('');

    // 이전 달 빈 칸
    const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month"><div class="day-number">${prevMonthLastDay - i}</div></div>`;
    }

    // 현재 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = today.getFullYear() === calendarYear && today.getMonth() === calendarMonth && today.getDate() === d;
      const dayEvents = events.filter(e => e.event_date === dateStr);

      html += `<div class="calendar-day ${isToday ? 'today' : ''}">
        <div class="day-number">${isToday ? `<span>${d}</span>` : d}</div>
        ${dayEvents.slice(0, 3).map(e => `<span class="event-dot ${e.type || e.category}" title="${e.title}: ${e.description || ''}">${e.title.substring(0, 8)}</span>`).join('')}
        ${dayEvents.length > 3 ? `<span style="font-size:11px;color:#888;">+${dayEvents.length - 3}개 더</span>` : ''}
      </div>`;
    }

    // 다음 달 빈 칸
    const totalCells = startDow + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="calendar-day other-month"><div class="day-number">${i}</div></div>`;
    }

    grid.innerHTML = html;

    // 이번 달 일정 목록 (관리자만)
    const eventList = document.getElementById('eventList');
    if (eventList) {
      const monthEvents = events.filter(e => {
        const eDate = new Date(e.event_date);
        return eDate.getFullYear() === calendarYear && eDate.getMonth() === calendarMonth;
      }).sort((a,b) => new Date(a.event_date) - new Date(b.event_date));

      if (monthEvents.length === 0) {
        eventList.innerHTML = '<p style="color:#888;font-size:14px;">이번 달 등록된 일정이 없습니다</p>';
      } else {
        eventList.innerHTML = monthEvents.map(e => `
          <div class="upcoming-event">
            <div class="date-box" style="background:${e.type === 'tax' ? '#e74c3c' : e.type === 'policy' ? '#27ae60' : '#3498db'}">
              <div class="day">${new Date(e.event_date).getDate()}</div>
            </div>
            <div class="event-info">
              <h4>${e.title}</h4>
              <p>${e.description || ''}</p>
            </div>
            ${e.type !== 'tax' ? `<button class="btn btn-danger btn-sm" onclick="deleteEvent(${e.id}, '${e.type}')">삭제</button>` : ''}
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error(e);
  }
}

function openAddEvent() {
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventDesc').value = '';
  document.getElementById('eventDate').value = '';
  document.getElementById('eventCategory').value = 'custom';
  openModal('eventModal');
}

async function saveEvent() {
  const body = {
    title: document.getElementById('eventTitle').value.trim(),
    description: document.getElementById('eventDesc').value.trim(),
    event_date: document.getElementById('eventDate').value,
    category: document.getElementById('eventCategory').value
  };
  if (!body.title || !body.event_date) {
    showToast('제목과 날짜를 입력하세요', 'error');
    return;
  }
  try {
    await api('/api/events', { method: 'POST', body });
    showToast('일정이 등록되었습니다', 'success');
    closeModal('eventModal');
    buildCalendar();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteEvent(id, type) {
  if (!confirm('이 일정을 삭제하시겠습니까?')) return;
  try {
    await api(`/api/events/${id}?type=${type}`, { method: 'DELETE' });
    showToast('일정이 삭제되었습니다', 'success');
    buildCalendar();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 드라이브 설정 (관리자) ============
async function renderDriveSettings(container) {
  let paymentDay = 10;
  let defaultExts = '.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm,.m4v,.mpg,.mpeg,.mp3,.wav,.aac,.flac,.ogg,.wma';
  try { const pd = await api('/api/settings/payment-day'); paymentDay = pd.paymentDay; } catch {}
  try { const ext = await api('/api/settings/default-extensions'); defaultExts = ext.extensions; } catch {}

  container.innerHTML = `
    <div class="page-header"><h1>⚙️ 설정</h1></div>

    <!-- 파일 확장자 필터 설정 -->
    <div class="card">
      <div class="card-header"><h3>🎬 파일 확장자 필터 (영상/미디어)</h3></div>
      <div style="margin-bottom:12px;">
        <label style="font-size:14px;font-weight:600;display:block;margin-bottom:6px;">기본 허용 확장자</label>
        <textarea id="defaultExtensions" rows="2" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:monospace;">${defaultExts}</textarea>
        <small style="color:#888;font-size:12px;display:block;margin-top:4px;">콤마로 구분. 여기 등록된 확장자만 작업 건수로 카운트됩니다. 새 프리랜서 추가 시 자동 적용됩니다.</small>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="saveDefaultExtensions()">💾 기본 확장자 저장</button>
        <button class="btn btn-warning btn-sm" style="white-space:nowrap;" onclick="applyExtensionsAll()">📋 전체 프리랜서에 일괄 적용</button>
        <button class="btn btn-danger btn-sm" style="white-space:nowrap;" onclick="cleanupNonVideoFiles()">🗑️ 비영상 파일 정리</button>
      </div>
      <div style="font-size:12px;color:#888;margin-top:10px;line-height:1.6;">
        <p>• <strong>기본 확장자 저장</strong>: 새 프리랜서 추가 시 자동으로 이 확장자가 적용됩니다</p>
        <p>• <strong>전체 프리랜서에 일괄 적용</strong>: 현재 활성 프리랜서 전원에 위 확장자를 적용합니다</p>
        <p>• <strong>비영상 파일 정리</strong>: 이미 불러온 파일 중 영상이 아닌 파일을 DB에서 삭제합니다</p>
      </div>
    </div>

    <!-- 정산 설정 -->
    <div class="card">
      <div class="card-header"><h3>💳 정산 설정</h3></div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="font-size:14px;">매월 지급 예정일:</label>
        <select id="paymentDaySelect" style="padding:8px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;">
          ${Array.from({length:28},(_,i)=> `<option value="${i+1}" ${i+1===paymentDay?'selected':''}>${i+1}일</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="savePaymentDay()">저장</button>
        <span style="font-size:13px;color:#888;">프리랜서 정산 시 지급 예정일로 표시됩니다</span>
      </div>
    </div>

    <!-- DB 백업/복원 -->
    <div class="card">
      <div class="card-header"><h3>💾 데이터 백업 / 복원</h3></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn btn-success" style="white-space:nowrap;" onclick="downloadBackup()">📥 DB 백업 다운로드</button>
        <button class="btn btn-warning" style="white-space:nowrap;" onclick="document.getElementById('restoreFile').click()">📤 DB 복원 (파일 선택)</button>
        <input type="file" id="restoreFile" accept=".db" style="display:none;" onchange="restoreBackup(this)">
      </div>
      <div style="font-size:13px;color:#888;line-height:1.8;">
        <p>백업: 현재 데이터베이스를 .db 파일로 다운로드합니다.</p>
        <p>복원: .db 파일을 선택하면 해당 데이터로 교체됩니다. (기존 데이터는 .bak 백업 생성)</p>
      </div>
    </div>

    <!-- 드라이브 설정 -->
    <div class="card">
      <div class="card-header"><h3>📌 Google Drive 연동</h3></div>
      <div class="drive-setup-steps">
        <ol>
          <li><strong>Google Cloud Console</strong>에서 프로젝트 생성 후 <strong>Google Drive API</strong> 활성화</li>
          <li><strong>서비스 계정</strong> 생성 → JSON 키 다운로드</li>
          <li>.env 파일에 <code>GOOGLE_CLIENT_EMAIL</code>과 <code>GOOGLE_PRIVATE_KEY</code> 설정</li>
          <li>프리랜서 드라이브 폴더에 서비스 계정 이메일을 <strong>뷰어</strong>로 공유</li>
          <li>서버 재시작 → 5분마다 자동 파일 감지!</li>
        </ol>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>📂 프리랜서별 드라이브 폴더 현황</h3>
        <button class="btn btn-primary btn-sm" onclick="syncAllDrive()">🔄 전체 동기화</button>
      </div>
      <div id="driveStatusTable">로딩 중...</div>
    </div>
  `;
  loadDriveStatus();
}

async function savePaymentDay() {
  const day = document.getElementById('paymentDaySelect').value;
  try {
    await api('/api/settings/payment-day', { method: 'POST', body: { day: parseInt(day) } });
    showToast(`지급 예정일이 매월 ${day}일로 설정되었습니다`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function saveDefaultExtensions() {
  const extensions = document.getElementById('defaultExtensions').value.trim();
  if (!extensions) { showToast('확장자를 입력하세요', 'error'); return; }
  try {
    await api('/api/settings/default-extensions', { method: 'POST', body: { extensions } });
    showToast('기본 확장자 설정이 저장되었습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function applyExtensionsAll() {
  const extensions = document.getElementById('defaultExtensions').value.trim();
  if (!extensions) { showToast('확장자를 입력하세요', 'error'); return; }
  if (!confirm('모든 활성 프리랜서에게 이 확장자 설정을 일괄 적용하시겠습니까?\n기존 개별 설정이 덮어쓰기됩니다.')) return;
  try {
    const result = await api('/api/settings/apply-extensions-all', { method: 'POST', body: { extensions } });
    showToast(result.message, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function cleanupNonVideoFiles() {
  if (!confirm('이미 불러온 파일 중 영상/미디어 확장자가 아닌 파일을 모두 삭제합니다.\n작업건수와 정산금액이 재계산됩니다. 진행하시겠습니까?')) return;
  try {
    const result = await api('/api/files/cleanup-non-video', { method: 'POST' });
    showToast(result.message, 'success');
    // 현재 페이지 새로고침
    navigateTo(currentPage);
  } catch (e) { showToast(e.message, 'error'); }
}

function downloadBackup() {
  window.open('/api/backup', '_blank');
  showToast('DB 백업 다운로드 중...', 'info');
}

async function restoreBackup(input) {
  if (!input.files || !input.files[0]) return;
  if (!confirm('정말 데이터베이스를 복원하시겠습니까?\n현재 데이터는 .bak 파일로 백업됩니다.')) {
    input.value = '';
    return;
  }
  try {
    const file = input.files[0];
    const buffer = await file.arrayBuffer();
    const res = await fetch('/api/restore', {
      method: 'POST',
      body: buffer
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    showToast('복원 실패: ' + e.message, 'error');
  }
  input.value = '';
}

function openBatchInvoice() {
  const year = document.getElementById('settleYear').value;
  const month = document.getElementById('settleMonth').value;
  window.open(`/api/invoice-batch?year=${year}&month=${month}`, '_blank');
}

async function loadDriveStatus() {
  try {
    const list = await api('/api/freelancers');
    const el = document.getElementById('driveStatusTable');
    if (list.length === 0) {
      el.innerHTML = '<p style="color:#888;">등록된 프리랜서가 없습니다</p>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>프리랜서</th><th>드라이브 폴더</th><th>확장자 필터</th><th>상태</th></tr></thead>
        <tbody>
          ${list.map(f => `
            <tr>
              <td><strong>${f.name}</strong></td>
              <td>${f.drive_folder_url ? `<a href="${f.drive_folder_url}" target="_blank" style="color:#3498db;">폴더 링크 열기</a>` : '<span style="color:#888;">미설정</span>'}</td>
              <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.file_extensions || '전체'}">${f.file_extensions ? `<span style="color:#27ae60;">${f.file_extensions}</span>` : '<span style="color:#e74c3c;">전체 (필터 없음)</span>'}</td>
              <td>${f.drive_folder_id ? '<span class="status-active">연결됨</span>' : '<span class="status-inactive">미연결</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    document.getElementById('driveStatusTable').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

async function syncAllDrive() {
  showToast('드라이브 동기화 중...', 'info');
  try {
    const result = await api('/api/sync-drive', { method: 'POST' });
    let msg = '동기화 완료: ';
    msg += result.results.map(r => `${r.name}: ${r.added}개 새 파일${r.error ? ` (오류: ${r.error})` : ''}`).join(', ');
    showToast(msg, 'success');
    // 현재 페이지 새로고침
    navigateTo(currentPage);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 비밀번호 변경 ============
function renderChangePassword(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>비밀번호 변경</h1>
    </div>
    <div class="card" style="max-width:500px;">
      <div class="form-group">
        <label>현재 비밀번호</label>
        <input type="password" id="cpCurrent">
      </div>
      <div class="form-group">
        <label>새 비밀번호</label>
        <input type="password" id="cpNew">
      </div>
      <div class="form-group">
        <label>새 비밀번호 확인</label>
        <input type="password" id="cpConfirm">
      </div>
      <button class="btn btn-primary" onclick="doChangePassword()">비밀번호 변경</button>
    </div>
  `;
}

async function doChangePassword() {
  const current = document.getElementById('cpCurrent').value;
  const newPw = document.getElementById('cpNew').value;
  const confirm = document.getElementById('cpConfirm').value;
  if (!current || !newPw) { showToast('비밀번호를 입력하세요', 'error'); return; }
  if (newPw !== confirm) { showToast('새 비밀번호가 일치하지 않습니다', 'error'); return; }
  try {
    await api('/api/change-password', { method: 'POST', body: { currentPassword: current, newPassword: newPw } });
    showToast('비밀번호가 변경되었습니다', 'success');
    document.getElementById('cpCurrent').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 파일 상태 변경 ============
async function updateFileStatus(fileId, status) {
  try {
    await api(`/api/files/${fileId}/status`, { method: 'PUT', body: { status } });
    const labels = { pending: '대기', reviewed: '확인완료', rejected: '반려' };
    showToast(`파일 상태가 "${labels[status]}"(으)로 변경되었습니다`, 'success');
    loadFiles();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ 연간 리포트 ============
async function loadYearlyReport() {
  const year = document.getElementById('reportYear').value;
  try {
    const data = await api(`/api/yearly-report?year=${year}`);
    renderYearlyChart(data);
    renderYearlyTable(data);
    renderYearlySummary(data);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderYearlyChart(data) {
  const canvas = document.getElementById('yearlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.parentElement.clientWidth || 800;
  const H = canvas.height = 300;
  ctx.clearRect(0, 0, W, H);

  const colors = ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#2c3e50'];
  const padL = 60, padR = 30, padT = 30, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // 월별 전체 합산 데이터
  const monthTotals = [];
  for (let m = 1; m <= 12; m++) {
    let total = 0;
    data.report.forEach(fl => { total += fl.months[m].count; });
    monthTotals.push(total);
  }
  const maxVal = Math.max(...monthTotals, 1);

  // 그리드 라인
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 5) * i), padL - 8, y + 4);
  }

  // 월 라벨
  const barGroupW = chartW / 12;
  ctx.fillStyle = '#666';
  ctx.font = '13px Segoe UI';
  ctx.textAlign = 'center';
  for (let m = 0; m < 12; m++) {
    ctx.fillText(`${m + 1}월`, padL + barGroupW * m + barGroupW / 2, H - 10);
  }

  if (data.report.length === 1) {
    // 프리랜서 1명이면 단일 막대
    const fl = data.report[0];
    for (let m = 1; m <= 12; m++) {
      const val = fl.months[m].count;
      const barH = (val / maxVal) * chartH;
      const x = padL + barGroupW * (m - 1) + barGroupW * 0.2;
      const w = barGroupW * 0.6;
      const y = padT + chartH - barH;
      ctx.fillStyle = colors[0];
      ctx.fillRect(x, y, w, barH);
      if (val > 0) {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Segoe UI';
        ctx.fillText(val, x + w / 2, y - 6);
      }
    }
  } else {
    // 여러 프리랜서 - 그룹 막대
    const barW = (barGroupW * 0.7) / data.report.length;
    data.report.forEach((fl, idx) => {
      for (let m = 1; m <= 12; m++) {
        const val = fl.months[m].count;
        const barH = (val / maxVal) * chartH;
        const x = padL + barGroupW * (m - 1) + barGroupW * 0.15 + barW * idx;
        const y = padT + chartH - barH;
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(x, y, barW - 1, barH);
      }
    });
  }

  // 범례 (HTML로 렌더링하여 겹침 방지)
  const legendArea = document.getElementById('yearlyLegendArea');
  if (legendArea) {
    if (data.report.length > 1) {
      legendArea.innerHTML = data.report.map((fl, idx) => `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${colors[idx % colors.length]};flex-shrink:0;"></span>
          <span style="font-size:13px;font-weight:600;color:#333;">${fl.name}</span>
        </div>
      `).join('');
    } else {
      legendArea.innerHTML = '';
    }
  }
}

function renderYearlyTable(data) {
  const area = document.getElementById('yearlyTableArea');
  if (!area) return;
  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  let html = `<table>
    <thead><tr><th>프리랜서</th>`;
  months.forEach(m => { html += `<th class="text-center">${m}</th>`; });
  html += `<th class="text-center" style="background:#e8f4fd;">합계</th><th class="text-right" style="background:#e8f4fd;">연간 금액</th></tr></thead><tbody>`;

  data.report.forEach(fl => {
    html += `<tr><td><strong>${fl.name}</strong></td>`;
    for (let m = 1; m <= 12; m++) {
      const cnt = fl.months[m].count;
      html += `<td class="text-center" style="${cnt > 0 ? 'color:#27ae60;font-weight:600;' : 'color:#ccc;'}">${cnt}</td>`;
    }
    html += `<td class="text-center" style="font-weight:700;color:#3498db;">${fl.yearTotal}</td>`;
    html += `<td class="text-right money" style="font-weight:700;">${formatMoney(fl.yearAmount)}</td></tr>`;
  });

  // 합계 행
  html += `<tr style="font-weight:700;border-top:2px solid #333;background:#f8f9fa;"><td>합계</td>`;
  for (let m = 1; m <= 12; m++) {
    let mTotal = 0;
    data.report.forEach(fl => { mTotal += fl.months[m].count; });
    html += `<td class="text-center">${mTotal}</td>`;
  }
  const totalCount = data.report.reduce((s, r) => s + r.yearTotal, 0);
  html += `<td class="text-center" style="color:#3498db;">${totalCount}</td>`;
  html += `<td class="text-right money">${formatMoney(data.grandTotal)}</td></tr>`;
  html += `</tbody></table>`;
  area.innerHTML = html;
}

function renderYearlySummary(data) {
  const area = document.getElementById('yearlySummaryArea');
  if (!area) return;
  const totalCount = data.report.reduce((s, r) => s + r.yearTotal, 0);
  const totalTax = Math.floor(data.grandTotal * 0.033);
  const totalNet = data.grandTotal - totalTax;

  area.innerHTML = `
    <div class="stats-grid" style="margin-bottom:0;">
      <div class="stat-card">
        <div class="stat-icon blue">📁</div>
        <div class="stat-info">
          <h4>${data.year}년 총 작업 건수</h4>
          <div class="value">${totalCount}건</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">💰</div>
        <div class="stat-info">
          <h4>${data.year}년 총 정산액</h4>
          <div class="value">${formatMoney(data.grandTotal)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">🏦</div>
        <div class="stat-info">
          <h4>3.3% 원천세 합계</h4>
          <div class="value">${formatMoney(totalTax)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">💵</div>
        <div class="stat-info">
          <h4>실 지급 총액</h4>
          <div class="value">${formatMoney(totalNet)}</div>
        </div>
      </div>
    </div>
  `;
}

// ============ 메모 기능 ============
async function loadMemos(year, month, freelancers) {
  const memoArea = document.getElementById('memoArea');
  if (!memoArea) return;

  try {
    const memos = await api(`/api/memos?year=${year}&month=${month}`);
    const memoMap = {};
    if (Array.isArray(memos)) {
      memos.forEach(m => { memoMap[m.freelancer_id] = m.memo; });
    }

    if (freelancers.length === 0) {
      memoArea.innerHTML = '<p style="color:#888;">등록된 프리랜서가 없습니다</p>';
      return;
    }

    memoArea.innerHTML = freelancers.map(fl => `
      <div class="memo-item">
        <div class="memo-label"><strong>${fl.name}</strong></div>
        <div class="memo-input-wrap">
          <textarea class="memo-textarea" id="memo_${fl.id}" rows="2" placeholder="${fl.name}님에 대한 ${month}월 메모...">${memoMap[fl.id] || ''}</textarea>
          <button class="btn btn-primary btn-sm" onclick="saveMemo(${fl.id}, ${year}, ${month})">저장</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    memoArea.innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

async function saveMemo(freelancerId, year, month) {
  const textarea = document.getElementById(`memo_${freelancerId}`);
  if (!textarea) return;
  try {
    await api('/api/memos', { method: 'POST', body: {
      freelancer_id: freelancerId,
      year: parseInt(year),
      month: parseInt(month),
      memo: textarea.value.trim()
    }});
    showToast('메모가 저장되었습니다', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============ CSV 다운로드 ============
function downloadCSV() {
  const year = document.getElementById('settleYear').value;
  const month = document.getElementById('settleMonth').value;
  window.open(`/api/export-csv?year=${year}&month=${month}`, '_blank');
  showToast(`${year}년 ${month}월 정산 CSV 다운로드 중...`, 'info');
}

// ============ 인보이스 생성 ============
function openInvoice(freelancerId, year, month) {
  window.open(`/api/invoice?freelancer_id=${freelancerId}&year=${year}&month=${month}`, '_blank');
}

// ============ 정산 상태 관리 ============
async function markAsPaid(freelancerId, year, month) {
  if (!confirm('이 프리랜서의 정산을 "지급완료"로 처리하시겠습니까?')) return;
  try {
    await api(`/api/payments/${freelancerId}/pay`, { method: 'PUT', body: { year: parseInt(year), month: parseInt(month) } });
    showToast('지급 완료 처리되었습니다', 'success');
    loadSettlement();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadPaymentStatus(year, month, freelancers) {
  try {
    const payments = await api(`/api/payments?year=${year}&month=${month}`);
    const payMap = {};
    payments.forEach(p => { payMap[p.freelancer_id] = p; });
    return payMap;
  } catch { return {}; }
}

// ============ 비교 분석 ============
async function loadAnalytics() {
  const year = document.getElementById('analyticsYear').value;
  try {
    const data = await api(`/api/analytics/compare?year=${year}`);
    const area = document.getElementById('analyticsContent');

    // MVP 카드
    let mvpHtml = '';
    if (data.mvp && data.mvp.totalFiles > 0) {
      mvpHtml = `
        <div class="card" style="background:linear-gradient(135deg,#fef3e2,#fff);border:2px solid #f39c12;">
          <h3 style="color:#f39c12;">🏆 ${year}년 MVP 프리랜서</h3>
          <div style="display:flex;align-items:center;gap:20px;margin-top:12px;">
            <div style="font-size:48px;">🥇</div>
            <div>
              <div style="font-size:24px;font-weight:700;">${data.mvp.name}</div>
              <div style="color:#888;">총 ${data.mvp.totalFiles}건 · ${formatMoney(data.mvp.totalAmount)}</div>
              <div style="color:#888;">월평균 ${data.mvp.avgPerMonth}건</div>
            </div>
          </div>
        </div>`;
    }

    // 비교 테이블
    let tableHtml = `<div class="card"><div class="card-header"><h3>📊 프리랜서 비교 테이블</h3></div>
      <div class="table-container"><table><thead><tr><th>프리랜서</th><th>총 작업</th><th>월평균</th><th>총 금액</th>
      ${Array.from({length:12},(_,i)=>`<th class="text-center">${i+1}월</th>`).join('')}</tr></thead><tbody>`;

    const sorted = [...data.comparison].sort((a,b) => b.totalFiles - a.totalFiles);
    sorted.forEach((fl, idx) => {
      const medal = idx === 0 && fl.totalFiles > 0 ? '🥇' : idx === 1 && fl.totalFiles > 0 ? '🥈' : idx === 2 && fl.totalFiles > 0 ? '🥉' : '';
      tableHtml += `<tr><td><strong>${medal} ${fl.name}</strong></td>
        <td class="text-center" style="font-weight:700;">${fl.totalFiles}건</td>
        <td class="text-center">${fl.avgPerMonth}</td>
        <td class="text-right money">${formatMoney(fl.totalAmount)}</td>`;
      for (let m = 1; m <= 12; m++) {
        const v = fl.months[m];
        tableHtml += `<td class="text-center" style="${v > 0 ? 'color:#27ae60;font-weight:600;' : 'color:#ddd;'}">${v}</td>`;
      }
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div></div>';

    // 월별 지출 차트
    let expenseHtml = `<div class="card"><div class="card-header"><h3>💸 월별 전체 지출 추이</h3></div>
      <div class="chart-container"><canvas id="expenseChart" width="800" height="250"></canvas></div></div>`;

    area.innerHTML = mvpHtml + tableHtml + expenseHtml + `
      <div class="card">
        <div class="card-header"><h3>💰 연간 지출 총액</h3></div>
        <div style="font-size:32px;font-weight:700;color:#302b63;text-align:center;padding:20px;">${formatMoney(data.totalExpense)}</div>
      </div>`;

    // 지출 차트 그리기
    setTimeout(() => drawExpenseChart(data.monthlyExpenses), 100);
  } catch (e) {
    document.getElementById('analyticsContent').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

function drawExpenseChart(monthlyExpenses) {
  const canvas = document.getElementById('expenseChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.parentElement.clientWidth || 800;
  const H = canvas.height = 250;
  ctx.clearRect(0, 0, W, H);

  const padL = 80, padR = 20, padT = 20, padB = 40;
  const cW = W - padL - padR, cH = H - padT - padB;
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(monthlyExpenses[m] || 0);
  const maxV = Math.max(...vals, 1);

  // 그리드
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'right';
    ctx.fillText(Math.round((maxV - (maxV/4)*i)/10000) + '만', padL - 6, y + 4);
  }

  // 막대 + 라인
  const bW = cW / 12;
  ctx.fillStyle = '#666'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'center';

  // 막대
  vals.forEach((v, i) => {
    const bH = (v / maxV) * cH;
    const x = padL + bW * i + bW * 0.15;
    const w = bW * 0.7;
    const y = padT + cH - bH;
    const grad = ctx.createLinearGradient(x, y, x, padT + cH);
    grad.addColorStop(0, '#3498db');
    grad.addColorStop(1, '#2980b9');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, bH);
    ctx.fillStyle = '#666';
    ctx.fillText(`${i+1}월`, padL + bW * i + bW / 2, H - 8);
    if (v > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px Segoe UI';
      ctx.fillText(Math.round(v/10000) + '만', padL + bW * i + bW / 2, y - 6);
    }
  });
}

// ============ 메시지/소통 ============
async function renderMessages(container) {
  container.innerHTML = `
    <div class="page-header"><h1>💬 메시지</h1></div>
    <div class="card">
      <div class="card-header"><h3>✉️ 새 메시지 보내기</h3></div>
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;color:#888;margin-bottom:6px;display:block;">받는 사람</label>
        <select id="msgReceiver" style="padding:10px 14px;border:2px solid #e0e0e0;border-radius:8px;min-width:200px;font-size:14px;">
          ${currentUser.role === 'admin' ? '<option value="">전체에게</option>' : ''}
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;color:#888;margin-bottom:6px;display:block;">메시지 내용</label>
        <textarea id="msgContent" rows="4" placeholder="메시지를 입력하세요..." style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;min-height:100px;box-sizing:border-box;"></textarea>
      </div>
      <div style="text-align:right;">
        <button class="btn btn-primary" onclick="sendMessage()">✉️ 보내기</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>📨 메시지 목록</h3></div>
      <div id="messageList">로딩 중...</div>
    </div>
  `;
  loadMessageReceivers();
  loadMessageList();
  // 읽음 처리
  api('/api/messages/mark-read', { method: 'POST' }).catch(() => {});
}

async function loadMessageReceivers() {
  try {
    const sel = document.getElementById('msgReceiver');
    if (currentUser.role === 'admin') {
      const list = await api('/api/freelancers');
      list.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.user_id;
        opt.textContent = f.name;
        sel.appendChild(opt);
      });
    } else {
      // 프리랜서는 관리자에게만 보낼 수 있음
      const opt = document.createElement('option');
      opt.value = '1';
      opt.textContent = '관리자';
      sel.appendChild(opt);
    }
  } catch {}
}

async function loadMessageList() {
  try {
    const messages = await api('/api/messages');
    const area = document.getElementById('messageList');
    if (messages.length === 0) {
      area.innerHTML = '<p style="color:#888;">메시지가 없습니다.</p>';
      return;
    }
    area.innerHTML = messages.map(m => {
      const isMe = m.sender_name === currentUser.displayName;
      const time = formatDateTime(m.created_at);
      return `<div class="message-item ${isMe ? 'msg-mine' : 'msg-other'}" style="${!m.is_read && !isMe ? 'background:#e8f4fd;' : ''}">
        <div class="msg-header">
          <strong>${m.sender_name}</strong> → ${m.receiver_name || '전체'}
          <span style="color:#999;font-size:12px;margin-left:auto;">${time}</span>
        </div>
        <div class="msg-body">${m.content}</div>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('messageList').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

async function sendMessage() {
  const receiverId = document.getElementById('msgReceiver').value;
  const content = document.getElementById('msgContent').value.trim();
  if (!content) { showToast('메시지를 입력하세요', 'error'); return; }
  try {
    await api('/api/messages', { method: 'POST', body: { receiver_id: receiverId ? parseInt(receiverId) : null, content } });
    showToast('메시지가 전송되었습니다', 'success');
    document.getElementById('msgContent').value = '';
    loadMessageList();
  } catch (e) { showToast(e.message, 'error'); }
}

// ============ 활동 로그 ============
async function renderLogs(container) {
  container.innerHTML = `
    <div class="page-header"><h1>📋 활동 로그</h1></div>
    <div class="card">
      <div class="table-container" id="logTableArea">로딩 중...</div>
    </div>
  `;
  try {
    const logs = await api('/api/logs?limit=100');
    const area = document.getElementById('logTableArea');
    if (logs.length === 0) {
      area.innerHTML = '<p style="color:#888;">활동 기록이 없습니다.</p>';
      return;
    }
    area.innerHTML = `<table><thead><tr><th>시간</th><th>사용자</th><th>작업</th><th>상세</th></tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td style="white-space:nowrap;font-size:12px;color:#888;">${formatDateTime(l.created_at)}</td>
        <td><strong>${l.user_name}</strong></td>
        <td><span class="log-action-badge">${l.action}</span></td>
        <td style="font-size:13px;color:#555;">${l.detail || '-'}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    document.getElementById('logTableArea').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

// ============ 파일 코멘트 (파일 목록에서 사용) ============
async function openFileComments(fileId, fileName) {
  try {
    const comments = await api(`/api/files/${fileId}/comments`);
    let commentsHtml = '';
    if (comments.length > 0) {
      commentsHtml = `<div style="max-height:300px;overflow-y:auto;margin-bottom:16px;">` +
        comments.map(c => `
          <div style="background:#f8f9fa;padding:12px;border-radius:8px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;">
              <strong>${c.user_name}</strong>
              <span style="color:#999;font-size:12px;">${formatDateTime(c.created_at)}</span>
            </div>
            <div style="margin-top:6px;font-size:14px;white-space:pre-wrap;">${c.comment}</div>
          </div>
        `).join('') + '</div>';
    } else {
      commentsHtml = '<p style="color:#888;margin-bottom:16px;">코멘트가 없습니다.</p>';
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'commentModal';
    overlay.innerHTML = `<div class="modal" style="max-width:560px;">
      <h3 style="margin-bottom:16px;">💬 ${fileName} 코멘트</h3>
      ${commentsHtml}
      <div style="margin-bottom:12px;">
        <textarea id="commentInput" rows="4" placeholder="코멘트를 입력하세요..." style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;min-height:100px;box-sizing:border-box;"></textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="addFileComment(${fileId}, '${fileName.replace(/'/g,"\\'")}')">등록</button>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">닫기</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  } catch (e) { showToast(e.message, 'error'); }
}

async function addFileComment(fileId, fileName) {
  const input = document.getElementById('commentInput');
  if (!input || !input.value.trim()) return;
  try {
    await api(`/api/files/${fileId}/comments`, { method: 'POST', body: { comment: input.value.trim() } });
    showToast('코멘트가 등록되었습니다', 'success');
    document.getElementById('commentModal')?.remove();
    openFileComments(fileId, fileName);
  } catch (e) { showToast(e.message, 'error'); }
}

// ============ 파일 태그 수정 ============
async function editFileTag(fileId) {
  const tag = prompt('파일 태그를 입력하세요\n(예: 수정필요, 컨펌완료, 재작업, 급함)\n비우면 태그 삭제:');
  if (tag === null) return;
  try {
    await api(`/api/files/${fileId}/tag`, { method: 'PUT', body: { tag: tag.trim() } });
    showToast(tag.trim() ? `태그 "${tag.trim()}" 설정 완료` : '태그가 삭제되었습니다', 'success');
    loadFiles();
  } catch (e) { showToast(e.message, 'error'); }
}

// ============ 알림 클릭 → 해당 페이지 이동 ============
async function goToNotification(notifId, link) {
  // 해당 알림 읽음 처리
  try { await api(`/api/notifications/${notifId}/read`, { method: 'POST' }); } catch {}
  // 배지 업데이트
  checkNotifications();
  // 해당 페이지로 이동
  if (link) {
    navigateTo(link);
  }
}

// ============ 알림벨 (주기적 체크) ============
let notifInterval = null;
function startNotifCheck() {
  if (notifInterval) clearInterval(notifInterval);
  checkNotifications();
  notifInterval = setInterval(checkNotifications, 30000);
}

async function checkNotifications() {
  try {
    const data = await api('/api/notifications/unread-count');
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = data.count;
      badge.style.display = data.count > 0 ? 'inline-flex' : 'none';
    }
  } catch {}
}

// ============ 길드 카드 거래 (스티커북) ============
let guildView = 'overview'; // 'overview' | 'book' | 'compare'
let guildCurrentBookId = null;
let guildCurrentBookName = '';
let guildCompareTargetId = null;
let guildCompareTargetName = '';

async function renderGuildCards(container) {
  container.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">로딩 중...</div>';
  try {
    if (guildView === 'book' && guildCurrentBookId) {
      await renderGuildBook(container, guildCurrentBookId, guildCurrentBookName);
    } else if (guildView === 'compare') {
      await renderGuildCompare(container, guildCompareTargetId, guildCompareTargetName);
    } else {
      await renderGuildOverview(container);
    }
  } catch(e) {
    container.innerHTML = `<p class="error-msg" style="padding:32px;">${e.message}</p>`;
  }
}

async function renderGuildOverview(container) {
  guildView = 'overview';
  const books = await api('/api/guild/books');
  const members = await api('/api/guild/members').catch(() => []);

  const totalOwned = books.reduce((s,b) => s + (b.owned_cards||0), 0);
  const totalCards = books.reduce((s,b) => s + (b.total_cards||0), 0);
  const totalTradeable = books.reduce((s,b) => s + (b.tradeable_total||0), 0);

  let bookGrid = books.map(b => {
    const pct = b.total_cards > 0 ? Math.round((b.owned_cards / b.total_cards) * 100) : 0;
    const full = b.owned_cards >= b.total_cards && b.total_cards > 0;
    return `
      <div class="sb-tile ${full ? 'sb-full' : ''}" onclick="guildOpenBook(${b.id},'${b.name.replace(/'/g,"\\'")}')">
        ${b.cover_image_path ? `<img class="sb-cover" src="${b.cover_image_path}" alt="${b.name}">` : `<div class="sb-cover sb-cover-placeholder"><span style="font-size:28px;">📖</span></div>`}
        ${b.tradeable_total > 0 ? `<div class="sb-tradeable-badge">+${b.tradeable_total}</div>` : ''}
        <div class="sb-name">${b.name}</div>
        <div class="sb-progress-text">${b.owned_cards} / ${b.total_cards}</div>
        <div class="sb-bar"><div class="sb-bar-fill" style="width:${pct}%"></div></div>
        ${currentUser.role==='admin' ? `<div class="sb-admin-btns" onclick="event.stopPropagation()">
          <button onclick="guildEditBook(${b.id},'${b.name.replace(/'/g,"\\'")}',${b.sort_order||0})" title="편집">✏️</button>
          <button onclick="guildDeleteBook(${b.id},'${b.name.replace(/'/g,"\\'")}')">🗑️</button>
        </div>` : ''}
      </div>`;
  }).join('');

  let memberHtml = '';
  if (members.length > 0) {
    memberHtml = `
      <div class="card" style="margin-top:24px;">
        <div class="card-header"><h3>👥 길드원 카드 현황</h3></div>
        <div class="table-container"><table>
          <thead><tr><th>닉네임</th><th>보유 스티커</th><th>교환 가능</th><th>비교</th></tr></thead>
          <tbody>${members.map(m => `<tr>
            <td><strong>${m.display_name}</strong></td>
            <td><span style="font-weight:700;color:#27ae60;">${m.owned_count}장</span></td>
            <td><span style="font-weight:700;color:#3498db;">${m.tradeable_count > 0 ? '+'+m.tradeable_count : '-'}장</span></td>
            <td><button class="btn btn-primary btn-sm" onclick="guildStartCompare(${m.id},'${m.display_name.replace(/'/g,"\\'")}')">🔄 비교</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>🃏 길드 카드 거래</h1>
      ${currentUser.role === 'admin' ? `<div class="actions">
        <button class="btn btn-primary btn-sm" onclick="guildAddBook()">+ 스티커북 추가</button>
      </div>` : ''}
    </div>
    <div class="card" style="padding:16px 24px;margin-bottom:20px;">
      <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:14px;color:#555;">내 보유: <strong style="color:#27ae60;font-size:18px;">${totalOwned}</strong><span style="color:#aaa;font-size:13px;"> / ${totalCards}</span></span>
        <span style="font-size:14px;color:#555;">교환 가능: <strong style="color:#3498db;font-size:18px;">${totalTradeable > 0 ? '+'+totalTradeable : 0}</strong></span>
        <span style="font-size:14px;color:#555;">스티커북: <strong>${books.length}종</strong></span>
      </div>
    </div>
    <div class="sb-grid">${bookGrid}</div>
    ${memberHtml}
  `;
}

function guildOpenBook(bookId, bookName) {
  guildView = 'book';
  guildCurrentBookId = bookId;
  guildCurrentBookName = bookName;
  renderGuildCards(document.getElementById('mainContent'));
}

function guildStartCompare(userId, userName) {
  guildView = 'compare';
  guildCompareTargetId = userId;
  guildCompareTargetName = userName;
  renderGuildCards(document.getElementById('mainContent'));
}

function guildBack() {
  guildView = 'overview';
  guildCurrentBookId = null;
  renderGuildCards(document.getElementById('mainContent'));
}

// ─── 스티커북 상세: 3×3 카드 그리드 ───
async function renderGuildBook(container, bookId, bookName) {
  container.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">로딩 중...</div>';
  const cards = await api(`/api/guild/books/${bookId}/cards`);

  // 9개 슬롯 보장
  const slots = Array.from({length: 9}, (_, i) => cards.find(c => c.position === i+1) || null);

  const renderStars = (r) => '★'.repeat(r) + '☆'.repeat(Math.max(0, 4-r));

  const cardHtml = slots.map((c, i) => {
    if (!c) {
      return `<div class="sc-wrap"><div class="sc rarity-1 sc-empty"><div class="sc-inner"><div class="sc-placeholder"><span style="font-size:22px;opacity:0.3;">☆</span><span style="font-size:11px;color:#bbb;margin-top:4px;">빈 슬롯</span></div></div><div class="sc-name">-</div></div></div>`;
    }
    const qty = c.my_quantity || 0;
    const tradeable = Math.max(0, qty - 1);
    const stars = renderStars(c.rarity || 1);
    const imgHtml = c.image_path
      ? `<img src="${c.image_path}" alt="${c.name}" loading="lazy">`
      : `<div class="sc-placeholder"><span class="sc-stars-inner">${stars}</span><span style="font-size:10px;color:#999;margin-top:2px;text-align:center;padding:0 4px;">${c.name}</span></div>`;

    return `
      <div class="sc-wrap">
        <div class="sc rarity-${c.rarity||1}" data-qty="${qty}" data-id="${c.id}">
          <div class="sc-stars">${stars}</div>
          <div class="sc-inner">${imgHtml}
            ${qty === 0 ? '<div class="sc-gray-overlay"></div>' : ''}
            ${tradeable > 0 ? `<div class="sc-tradeable">+${tradeable}</div>` : ''}
            ${qty > 0 && tradeable === 0 ? '<div class="sc-owned-dot"></div>' : ''}
            <button class="sc-btn sc-btn-minus" onclick="guildAdjustQty(${c.id}, -1, this)" title="−1">−</button>
            <button class="sc-btn sc-btn-plus" onclick="guildAdjustQty(${c.id}, 1, this)" title="+1">+</button>
          </div>
          <div class="sc-name">${c.name}</div>
          ${currentUser.role==='admin' ? `<button class="sc-edit-btn" onclick="guildEditCard(${c.id},'${c.name.replace(/'/g,"\\'")}',${c.rarity||1},'${(c.image_path||'').replace(/'/g,"\\'")}',${bookId})" title="편집">✏️</button>` : ''}
        </div>
      </div>`;
  }).join('');

  const totalOwned = slots.filter(c => c && (c.my_quantity||0) > 0).length;
  const totalTradeable = slots.reduce((s, c) => s + (c ? Math.max(0, (c.my_quantity||0)-1) : 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="guildBack()">← 목록</button>
        <h1 style="margin:0;">${bookName}</h1>
      </div>
      ${currentUser.role==='admin' ? `<div class="actions">
        <button class="btn btn-primary btn-sm" onclick="guildBulkAddCards(${bookId})">일괄 등록</button>
        <button class="btn btn-success btn-sm" onclick="guildAddCard(${bookId})">+ 카드 추가</button>
      </div>` : ''}
    </div>
    <div class="card" style="padding:14px 20px;margin-bottom:16px;">
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:14px;">보유: <strong style="color:#27ae60;font-size:18px;">${totalOwned}</strong><span style="color:#aaa;font-size:13px;"> / 9</span></span>
        <span style="font-size:14px;">교환 가능: <strong style="color:#3498db;font-size:18px;">${totalTradeable > 0 ? '+'+totalTradeable : 0}</strong></span>
        <span style="font-size:12px;color:#aaa;margin-left:auto;">좌측 <span style="color:#e74c3c;font-weight:700;">−</span> / 우측 <span style="color:#3498db;font-weight:700;">+</span> 버튼으로 수량 조정 · 자동 저장</span>
      </div>
    </div>
    <div class="sc-grid">${cardHtml}</div>
  `;
}

async function guildAdjustQty(cardId, delta, btn) {
  btn.disabled = true;
  try {
    const res = await api(`/api/guild/cards/${cardId}/quantity`, { method: 'POST', body: { delta } });
    const qty = res.quantity;
    const card = document.querySelector(`.sc[data-id="${cardId}"]`);
    if (!card) return;
    card.dataset.qty = qty;
    const tradeable = Math.max(0, qty - 1);

    // 교환 배지 갱신
    let badge = card.querySelector('.sc-tradeable');
    let dot = card.querySelector('.sc-owned-dot');
    let overlay = card.querySelector('.sc-gray-overlay');

    if (overlay) { if (qty > 0) overlay.remove(); }
    else if (qty === 0) {
      const inner = card.querySelector('.sc-inner');
      const ov = document.createElement('div');
      ov.className = 'sc-gray-overlay';
      inner.appendChild(ov);
    }

    if (tradeable > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'sc-tradeable';
        card.querySelector('.sc-inner').appendChild(badge);
      }
      badge.textContent = '+' + tradeable;
      if (dot) dot.remove();
    } else {
      if (badge) badge.remove();
      if (qty > 0) {
        if (!dot) {
          dot = document.createElement('div');
          dot.className = 'sc-owned-dot';
          card.querySelector('.sc-inner').appendChild(dot);
        }
      } else {
        if (dot) dot.remove();
      }
    }

    // 상단 통계 갱신
    const grid = card.closest('.sc-grid');
    if (grid) {
      const allCards = [...grid.querySelectorAll('.sc[data-id]')];
      const newOwned = allCards.filter(el => parseInt(el.dataset.qty) > 0).length;
      const newTrade = allCards.reduce((s, el) => s + Math.max(0, parseInt(el.dataset.qty||0) - 1), 0);
      const statEl = grid.previousElementSibling?.querySelector('strong[style*="27ae60"]');
      const tradeEl = grid.previousElementSibling?.querySelector('strong[style*="3498db"]');
      if (statEl) statEl.textContent = newOwned;
      if (tradeEl) tradeEl.textContent = newTrade > 0 ? '+'+newTrade : 0;
    }
  } catch(e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

// ─── 카드 비교 ───
async function renderGuildCompare(container, targetUserId, targetUserName) {
  container.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">비교 중...</div>';
  const result = await api(`/api/guild/compare/${targetUserId}`);
  const { canGive, canReceive } = result;

  const renderChips = (cards) => {
    if (!cards.length) return '<p style="color:#bbb;font-size:14px;padding:8px 0;">없음</p>';
    const byBook = {};
    cards.forEach(c => { if(!byBook[c.book_name]) byBook[c.book_name]=[]; byBook[c.book_name].push(c); });
    return Object.entries(byBook).map(([bk, cs]) =>
      `<div style="margin-bottom:10px;">
        <div style="font-size:11px;color:#999;font-weight:700;margin-bottom:4px;">${bk}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${cs.map(c =>
          `<span class="sc-chip rarity-chip-${c.rarity||1}">${c.name}${c.tradeable_qty > 1 ? `<span style="font-size:10px;opacity:0.8;"> ×${c.tradeable_qty}</span>` : ''}</span>`
        ).join('')}</div>
      </div>`
    ).join('');
  };

  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="guildBack()">← 목록</button>
        <h1 style="margin:0;font-size:20px;"><strong>${targetUserName}</strong>님과 카드 비교</h1>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card compare-give">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:22px;">📤</span>
          <h3 style="color:#27ae60;">내가 줄 수 있는 카드</h3>
          <span class="compare-count give">${canGive.length}</span>
        </div>
        <p style="font-size:12px;color:#888;margin-bottom:16px;">내가 여분 있음 + ${targetUserName}님이 없음</p>
        ${renderChips(canGive)}
      </div>
      <div class="card compare-receive">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:22px;">📥</span>
          <h3 style="color:#3498db;">내가 받을 수 있는 카드</h3>
          <span class="compare-count receive">${canReceive.length}</span>
        </div>
        <p style="font-size:12px;color:#888;margin-bottom:16px;">${targetUserName}님이 여분 있음 + 내가 없음</p>
        ${renderChips(canReceive)}
      </div>
    </div>
  `;
}

// ─── 관리자: 스티커북 추가 ───
function guildAddBook() {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show';
  ov.innerHTML = `<div class="modal" style="max-width:400px;">
    <h2>📖 스티커북 추가</h2>
    <div class="form-group"><label>이름 *</label><input id="gbName" type="text" placeholder="예: 야생몬스터"></div>
    <div class="form-group"><label>정렬 순서</label><input id="gbOrder" type="number" value="0"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
      <button class="btn btn-primary" onclick="guildSaveBook(null)">추가</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('gbName').focus();
}

function guildEditBook(id, name, order) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show';
  ov.innerHTML = `<div class="modal" style="max-width:400px;">
    <h2>📖 스티커북 편집</h2>
    <div class="form-group"><label>이름 *</label><input id="gbName" type="text" value="${name}"></div>
    <div class="form-group"><label>정렬 순서</label><input id="gbOrder" type="number" value="${order}"></div>
    <div class="form-group"><label>커버 이미지 경로</label><input id="gbCover" type="text" placeholder="/cards/book1/cover.jpg"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
      <button class="btn btn-primary" onclick="guildSaveBook(${id})">저장</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function guildSaveBook(id) {
  const name = document.getElementById('gbName').value.trim();
  const order = parseInt(document.getElementById('gbOrder').value) || 0;
  const cover = document.getElementById('gbCover')?.value.trim() || '';
  if (!name) { showToast('이름을 입력하세요', 'error'); return; }
  try {
    if (id) {
      await api(`/api/guild/books/${id}`, { method: 'PUT', body: { name, sort_order: order, cover_image_path: cover } });
    } else {
      await api('/api/guild/books', { method: 'POST', body: { name, sort_order: order } });
    }
    document.querySelector('.modal-overlay')?.remove();
    showToast('저장됐습니다', 'success');
    guildView = 'overview';
    renderGuildCards(document.getElementById('mainContent'));
  } catch(e) { showToast(e.message, 'error'); }
}

async function guildDeleteBook(id, name) {
  if (!confirm(`"${name}" 스티커북과 모든 카드 데이터를 삭제하시겠습니까?`)) return;
  try {
    await api(`/api/guild/books/${id}`, { method: 'DELETE' });
    showToast('삭제됐습니다', 'success');
    guildView = 'overview';
    renderGuildCards(document.getElementById('mainContent'));
  } catch(e) { showToast(e.message, 'error'); }
}

// ─── 관리자: 카드 추가/편집 ───
function guildAddCard(bookId) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show';
  ov.innerHTML = `<div class="modal" style="max-width:400px;">
    <h2>🃏 카드 추가</h2>
    <div class="form-group"><label>카드 이름 *</label><input id="gcName" type="text"></div>
    <div class="form-group"><label>위치 (1~9)</label><input id="gcPos" type="number" min="1" max="9" value="1"></div>
    <div class="form-group"><label>레어도</label><select id="gcRarity">
      <option value="1">★ 1성</option><option value="2">★★ 2성</option>
      <option value="3">★★★ 3성</option><option value="4">★★★★ 4성</option>
    </select></div>
    <div class="form-group"><label>이미지 경로</label><input id="gcImg" type="text" placeholder="/cards/book1/card1.jpg"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
      <button class="btn btn-primary" onclick="guildSaveCard(null,${bookId})">추가</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('gcName').focus();
}

function guildEditCard(id, name, rarity, imgPath, bookId) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show';
  ov.innerHTML = `<div class="modal" style="max-width:400px;">
    <h2>🃏 카드 편집</h2>
    <div class="form-group"><label>카드 이름</label><input id="gcName" type="text" value="${name}"></div>
    <div class="form-group"><label>위치 (1~9)</label><input id="gcPos" type="number" min="1" max="9"></div>
    <div class="form-group"><label>레어도</label><select id="gcRarity">
      <option value="1" ${rarity==1?'selected':''}>★ 1성</option>
      <option value="2" ${rarity==2?'selected':''}>★★ 2성</option>
      <option value="3" ${rarity==3?'selected':''}>★★★ 3성</option>
      <option value="4" ${rarity==4?'selected':''}>★★★★ 4성</option>
    </select></div>
    <div class="form-group"><label>이미지 경로</label><input id="gcImg" type="text" value="${imgPath}"></div>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="guildDeleteCard(${id},'${name.replace(/'/g,"\\'")}')">삭제</button>
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
      <button class="btn btn-primary" onclick="guildSaveCard(${id},${bookId})">저장</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function guildSaveCard(id, bookId) {
  const name = document.getElementById('gcName').value.trim();
  const pos = parseInt(document.getElementById('gcPos').value) || 1;
  const rarity = parseInt(document.getElementById('gcRarity').value) || 1;
  const img = document.getElementById('gcImg').value.trim();
  if (!name) { showToast('카드 이름을 입력하세요', 'error'); return; }
  try {
    if (id) {
      await api(`/api/guild/cards/${id}`, { method: 'PUT', body: { name, position: pos, rarity, image_path: img } });
    } else {
      await api('/api/guild/cards', { method: 'POST', body: { book_id: bookId, name, position: pos, rarity, image_path: img } });
    }
    document.querySelector('.modal-overlay')?.remove();
    showToast('저장됐습니다', 'success');
    renderGuildBook(document.getElementById('mainContent'), bookId, guildCurrentBookName);
  } catch(e) { showToast(e.message, 'error'); }
}

async function guildDeleteCard(id, name) {
  if (!confirm(`"${name}" 카드를 삭제하시겠습니까?`)) return;
  try {
    await api(`/api/guild/cards/${id}`, { method: 'DELETE' });
    document.querySelector('.modal-overlay')?.remove();
    showToast('삭제됐습니다', 'success');
    renderGuildBook(document.getElementById('mainContent'), guildCurrentBookId, guildCurrentBookName);
  } catch(e) { showToast(e.message, 'error'); }
}

// ─── 관리자: 카드 일괄 등록 ───
function guildBulkAddCards(bookId) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay show';
  ov.innerHTML = `<div class="modal" style="max-width:480px;">
    <h2>📋 카드 일괄 등록</h2>
    <p style="font-size:13px;color:#888;margin-bottom:16px;">카드 이름 9개를 한 줄씩 입력하세요 (위치 1→9 순서, 기존 카드는 삭제됩니다)</p>
    <div class="form-group">
      <label>카드 이름 (한 줄 = 1장)</label>
      <textarea id="gcBulk" rows="10" style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;box-sizing:border-box;" placeholder="카드1&#10;카드2&#10;카드3&#10;카드4&#10;카드5&#10;카드6&#10;카드7&#10;카드8&#10;카드9"></textarea>
    </div>
    <div class="form-group">
      <label>기본 레어도 (공통 적용)</label>
      <select id="gcBulkRarity"><option value="1">★</option><option value="2">★★</option><option value="3" selected>★★★</option><option value="4">★★★★</option></select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
      <button class="btn btn-primary" onclick="guildSubmitBulk(${bookId})">등록</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('gcBulk').focus();
}

async function guildSubmitBulk(bookId) {
  const text = document.getElementById('gcBulk').value;
  const rarity = parseInt(document.getElementById('gcBulkRarity').value) || 1;
  const names = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.length) { showToast('카드 이름을 입력하세요', 'error'); return; }
  try {
    await api(`/api/guild/books/${bookId}/cards/bulk`, { method: 'POST', body: { names, rarity } });
    document.querySelector('.modal-overlay')?.remove();
    showToast(`${names.length}장 등록 완료`, 'success');
    renderGuildBook(document.getElementById('mainContent'), bookId, guildCurrentBookName);
  } catch(e) { showToast(e.message, 'error'); }
}

// ============ 초기화 ============
document.addEventListener('DOMContentLoaded', checkAuth);
