require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'freelancer.db');

// DB 디렉토리가 없으면 자동 생성
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db; // sql.js 데이터베이스 인스턴스

// 기본 영상/미디어 확장자 목록
const DEFAULT_VIDEO_EXTENSIONS = '.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm,.m4v,.mpg,.mpeg,.mp3,.wav,.aac,.flac,.ogg,.wma';

// DB를 파일로 저장하는 헬퍼
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// sql.js 래퍼: better-sqlite3과 유사한 인터페이스
function runSql(sql, params = []) {
  db.run(sql, params);
  // last_insert_rowid를 db.exec 대신 prepare/step으로 가져옴
  const stmt = db.prepare("SELECT last_insert_rowid() as id");
  stmt.step();
  const lastId = stmt.getAsObject().id;
  stmt.free();
  saveDb();
  return { lastInsertRowid: lastId };
}

function getSql(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function allSql(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function execSql(sql) {
  db.exec(sql);
  saveDb();
}

// ============ 메인 시작 함수 ============
async function main() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });

  // 기존 DB 파일이 있으면 로드, 없으면 새로 생성
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('기존 데이터베이스 로드 완료');
  } else {
    db = new SQL.Database();
    console.log('새 데이터베이스 생성');
  }

  // 테이블 생성
  execSql(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'freelancer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS freelancers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      unit_price INTEGER NOT NULL DEFAULT 0,
      drive_folder_id TEXT,
      drive_folder_url TEXT,
      file_extensions TEXT DEFAULT '',
      memo TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS drive_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freelancer_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_id TEXT UNIQUE,
      file_type TEXT,
      file_size INTEGER,
      uploader_name TEXT,
      uploaded_at DATETIME NOT NULL,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      year INTEGER,
      month INTEGER,
      FOREIGN KEY (freelancer_id) REFERENCES freelancers(id)
    );
    CREATE TABLE IF NOT EXISTS tax_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      event_end_date TEXT,
      category TEXT DEFAULT 'tax',
      is_recurring INTEGER DEFAULT 0,
      recurring_month INTEGER,
      recurring_day INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS custom_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      event_end_date TEXT,
      category TEXT DEFAULT 'custom',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS monthly_memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freelancer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      memo TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(freelancer_id, year, month)
    );
  `);

  // 기존 DB 호환: 새 칼럼 추가
  try { db.run("ALTER TABLE drive_files ADD COLUMN status TEXT DEFAULT 'pending'"); saveDb(); } catch(e) {}
  try { db.run("ALTER TABLE drive_files ADD COLUMN project_id INTEGER"); saveDb(); } catch(e) {}
  try { db.run("ALTER TABLE freelancers ADD COLUMN contract_start TEXT DEFAULT ''"); saveDb(); } catch(e) {}
  try { db.run("ALTER TABLE freelancers ADD COLUMN contract_end TEXT DEFAULT ''"); saveDb(); } catch(e) {}
  try { db.run("ALTER TABLE freelancers ADD COLUMN file_extensions TEXT DEFAULT ''"); saveDb(); } catch(e) {}
  try { db.run("ALTER TABLE freelancers ADD COLUMN memo TEXT DEFAULT ''"); saveDb(); } catch(e) {}

  // 기본 영상 확장자: file_extensions가 비어있는 프리랜서에 기본값 적용
  {
    const defaultExtSetting = getSql("SELECT value FROM settings WHERE key='default_extensions'");
    const defaultExts = defaultExtSetting ? defaultExtSetting.value : DEFAULT_VIDEO_EXTENSIONS;
    // 확장자가 비어있는 모든 활성 프리랜서에 기본 영상 확장자 설정
    const emptyExtFreelancers = allSql("SELECT id FROM freelancers WHERE (file_extensions IS NULL OR file_extensions = '') AND active = 1");
    if (emptyExtFreelancers.length > 0) {
      for (const fl of emptyExtFreelancers) {
        db.run("UPDATE freelancers SET file_extensions = ? WHERE id = ?", [defaultExts, fl.id]);
      }
      saveDb();
      console.log(`[초기화] ${emptyExtFreelancers.length}명의 프리랜서에 기본 영상 확장자 설정 완료`);
    }
  }

  // 계약서 이력 테이블
  execSql(`
    CREATE TABLE IF NOT EXISTS contract_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freelancer_id INTEGER NOT NULL,
      form_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (freelancer_id) REFERENCES freelancers(id)
    );
  `);

  // 새 테이블: 정산 상태 관리
  execSql(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freelancer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      net_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'unpaid',
      paid_at TEXT,
      memo TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(freelancer_id, year, month)
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freelancer_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      unit_price INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      target_type TEXT DEFAULT '',
      target_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_id INTEGER,
      receiver_name TEXT,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS file_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#3498db',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      link TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 길드 카드 테이블 마이그레이션 (구버전 스키마 감지 후 교체)
  try {
    const oldSchema = getSql("SELECT sql FROM sqlite_master WHERE type='table' AND name='guild_cards'");
    if (oldSchema && oldSchema.sql && !oldSchema.sql.includes('book_id')) {
      db.run("DROP TABLE IF EXISTS user_card_inventory"); saveDb();
      db.run("DROP TABLE IF EXISTS guild_cards"); saveDb();
    }
  } catch(e) {}

  execSql(`
    CREATE TABLE IF NOT EXISTS guild_sticker_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      cover_image_path TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS guild_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 1,
      rarity INTEGER NOT NULL DEFAULT 1,
      image_path TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES guild_sticker_books(id)
    );
    CREATE TABLE IF NOT EXISTS user_card_quantity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, card_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (card_id) REFERENCES guild_cards(id)
    );
  `);

  // 스티커북 초기 데이터
  {
    const bookCount = getSql("SELECT COUNT(*) as cnt FROM guild_sticker_books");
    if (bookCount.cnt === 0) {
      const SEED = [
        { name: '야생몬스터', order: 1, cards: [
          {p:1,n:'사방에서 숙숙!',r:2},{p:2,n:'날카로운 발톱',r:2},{p:3,n:'자신만만한 검객',r:1},
          {p:4,n:'불길한 창조',r:2},{p:5,n:'영혼의 속삭임',r:2},{p:6,n:'창처럼 날카로운',r:2},
          {p:7,n:'닭? 독수리?',r:1},{p:8,n:'작은 날개의 휴식',r:1},{p:9,n:'사악한 뼈',r:2}
        ]},
        { name: '물속 몬스터', order: 2, cards: [
          {p:1,n:'젤만',r:2},{p:2,n:'겁진 주회',r:3},{p:3,n:'분홍색 구름',r:3},
          {p:4,n:'황금왕관 구름',r:3},{p:5,n:'무감성',r:2},{p:6,n:'물속 수겆',r:1},
          {p:7,n:'바위 주먹',r:1},{p:8,n:'진진 통화',r:2},{p:9,n:'유령선의 비밀',r:2}
        ]},
        { name: '던전 몬스터', order: 3, cards: [
          {p:1,n:'지배한 알심',r:2},{p:2,n:'정하니...',r:2},{p:3,n:'철벽 쉬어',r:3},
          {p:4,n:'단호한 일격',r:3},{p:5,n:'아이의 분노',r:3},{p:6,n:'끊뇨는 것',r:3},
          {p:7,n:'배이른 용기',r:4},{p:8,n:'굳건한 자승',r:4},{p:9,n:'탑의 최상층에서',r:4}
        ]},
        { name: '메인 스토리', order: 4, cards: [
          {p:1,n:'위대한 탄생',r:3},{p:2,n:'검은 에너지',r:3},{p:3,n:'흥분하는 번개',r:3},
          {p:4,n:'분노의 감정',r:4},{p:5,n:'연낙설의 부홀',r:4},{p:6,n:'포효의 침',r:3},
          {p:7,n:'위기 속 삼삼하',r:4},{p:8,n:'긴장되는 순간',r:4},{p:9,n:'선연한 강비',r:4}
        ]},
        { name: '숲속 생활', order: 5, cards: [
          {p:1,n:'천진 우산',r:2},{p:2,n:'친호 세수',r:3},{p:3,n:'파란 통방',r:2},
          {p:4,n:'하로 시신',r:3},{p:5,n:'잘아는 토끼',r:3},{p:6,n:'위험한 장난',r:3},
          {p:7,n:'뭐 오는 길인 산책',r:3},{p:8,n:'무슨 일이야?',r:3},{p:9,n:'숲속의 밤',r:4}
        ]},
        { name: '화산지대', order: 6, cards: [
          {p:1,n:'불꽃의 맞주',r:2},{p:2,n:'용암정 고시다',r:2},{p:3,n:'친 낭놀이',r:3},
          {p:4,n:'화염의 지배자',r:3},{p:5,n:'보금의 시신',r:3},{p:6,n:'화염의 포효',r:3},
          {p:7,n:'불꽃의 탄생',r:3},{p:8,n:'무너지는 산악',r:3},{p:9,n:'지옥의 불길',r:4}
        ]},
        { name: '어둠속 존재', order: 7, cards: [
          {p:1,n:'은밀한 습격',r:3},{p:2,n:'달빛 아래',r:3},{p:3,n:'우주',r:3},
          {p:4,n:'수정 조각',r:3},{p:5,n:'어두운 사슬',r:3},{p:6,n:'용암 지대',r:4},
          {p:7,n:'검은 오라',r:4},{p:8,n:'마법',r:4},{p:9,n:'목적지',r:4}
        ]},
        { name: '특별한 장소', order: 8, cards: [
          {p:1,n:'행복의 왕자',r:2},{p:2,n:'가사도',r:3},{p:3,n:'상트',r:3},
          {p:4,n:'락숙 친구',r:3},{p:5,n:'관한 조회',r:3},{p:6,n:'선진올전 따애모',r:3},
          {p:7,n:'서넉스 무대',r:4},{p:8,n:'마녀의 집',r:4},{p:9,n:'두 짤깔',r:4}
        ]},
        { name: '놀이시간', order: 9, cards: [
          {p:1,n:'자기 키!',r:1},{p:2,n:'뚝한 조심!',r:2},{p:3,n:'낚시볼 하하고',r:2},
          {p:4,n:'찰한 사냥',r:3},{p:5,n:'수영 후',r:3},{p:6,n:'거기 서!',r:3},
          {p:7,n:'남빈한 목직임',r:3},{p:8,n:'잔전',r:4},{p:9,n:'베비 대장',r:4}
        ]},
        { name: '강철 쇼크', order: 10, cards: [
          {p:1,n:'토키 친구들',r:2},{p:2,n:'내리치는 번개',r:2},{p:3,n:'쏟아지는 번개',r:3},
          {p:4,n:'은밀한 사격',r:3},{p:5,n:'전기 충전',r:3},{p:6,n:'사과 베기!',r:3},
          {p:7,n:'날카로운 검',r:4},{p:8,n:'돌아가는 태업',r:4},{p:9,n:'태업의 성',r:4}
        ]},
        { name: '요정의 숲', order: 11, cards: [
          {p:1,n:'꿀 수집가',r:2},{p:2,n:'화관',r:3},{p:3,n:'버섯',r:3},
          {p:4,n:'별과 잠',r:3},{p:5,n:'유령과 등불',r:3},{p:6,n:'개미와 디저트',r:3},
          {p:7,n:'디저트 파티',r:4},{p:8,n:'사랑 비',r:4},{p:9,n:'장미 정원',r:3}
        ]},
        { name: '바다 아래', order: 12, cards: [
          {p:1,n:'카드 1',r:2},{p:2,n:'카드 2',r:2},{p:3,n:'카드 3',r:3},
          {p:4,n:'카드 4',r:3},{p:5,n:'카드 5',r:3},{p:6,n:'카드 6',r:3},
          {p:7,n:'카드 7',r:4},{p:8,n:'카드 8',r:4},{p:9,n:'카드 9',r:4}
        ]},
        { name: '유령 마을', order: 13, cards: [
          {p:1,n:'봉대',r:2},{p:2,n:'눈물 가려도',r:2},{p:3,n:'흑과 백',r:2},
          {p:4,n:'모래 다이빙',r:3},{p:5,n:'멋진 뼈',r:3},{p:6,n:'도깨비불',r:3},
          {p:7,n:'슬바꽥질',r:4},{p:8,n:'은밀하게',r:4},{p:9,n:'그림자 번개',r:4}
        ]},
        { name: '빛 아래', order: 14, cards: [
          {p:1,n:'휴입자',r:3},{p:2,n:'나도 배지고 싶어',r:3},{p:3,n:'선물 시간',r:3},
          {p:4,n:'적은 친구',r:4},{p:5,n:'용희',r:4},{p:6,n:'화희',r:3},
          {p:7,n:'경잠',r:4},{p:8,n:'꽃과 나비',r:4},{p:9,n:'타포',r:3}
        ]},
        { name: '하늘나라', order: 15, cards: [
          {p:1,n:'빛과 나비',r:3},{p:2,n:'구름 같은',r:3},{p:3,n:'꿈에',r:3},
          {p:4,n:'황금',r:4},{p:5,n:'구름 위 잠',r:4},{p:6,n:'해태',r:3},
          {p:7,n:'재밌어',r:4},{p:8,n:'요정의 가루',r:4},{p:9,n:'빛의 비행',r:3}
        ]},
        { name: '따스한 여름', order: 16, cards: [
          {p:1,n:'여의주',r:2},{p:2,n:'호기심',r:2},{p:3,n:'따사로운 아침',r:3},
          {p:4,n:'가장 행복한 시간',r:4},{p:5,n:'고기가 최고야',r:4},{p:6,n:'폭포 아래',r:3},
          {p:7,n:'패진 바위',r:4},{p:8,n:'호수 전경',r:4},{p:9,n:'상처와 친구',r:3}
        ]},
        { name: '차가운 겨울', order: 17, cards: [
          {p:1,n:'냉기 바람',r:2},{p:2,n:'혹한의 포효',r:2},{p:3,n:'눈보라',r:4},
          {p:4,n:'넌 너무 차가워',r:4},{p:5,n:'챔피언...?',r:4},{p:6,n:'흩날리는 눈꽃',r:3},
          {p:7,n:'시린 냉기',r:4},{p:8,n:'마법의 빛',r:4},{p:9,n:'겨울의 바람',r:4}
        ]},
        { name: '나쁜놈 오전', order: 18, cards: [
          {p:1,n:'피어나는 꽃',r:2},{p:2,n:'자연의 아름다움',r:3},{p:3,n:'새들의 지저귐',r:4},
          {p:4,n:'무지개 산책',r:4},{p:5,n:'겁쟁이',r:4},{p:6,n:'친구',r:3},
          {p:7,n:'모두 사이좋게',r:4},{p:8,n:'노래와 낮잠',r:4},{p:9,n:'봄의 햇살',r:3}
        ]},
        { name: '활발한 오후', order: 19, cards: [
          {p:1,n:'바닷속 유영',r:3},{p:2,n:'아야!',r:3},{p:3,n:'째려보기',r:4},
          {p:4,n:'이건 내 거야',r:4},{p:5,n:'이것도 내 거야',r:4},{p:6,n:'한 번 더',r:3},
          {p:7,n:'넌 누구니?',r:4},{p:8,n:'사냥 시간',r:4},{p:9,n:'자유로운 공연',r:4}
        ]},
        { name: '조용한 밤', order: 20, cards: [
          {p:1,n:'같이 잘래?',r:3},{p:2,n:'혼자는 무서워',r:4},{p:3,n:'빛나는 꼬리',r:3},
          {p:4,n:'동굴 속 길잡이',r:4},{p:5,n:'불길한 오라',r:4},{p:6,n:'공포의 성',r:4},
          {p:7,n:'달과 밤',r:4},{p:8,n:'달빛의 호수',r:4},{p:9,n:'암울한 전조',r:4}
        ]}
      ];
      for (const book of SEED) {
        const br = runSql('INSERT INTO guild_sticker_books (name, sort_order) VALUES (?,?)', [book.name, book.order]);
        for (const c of book.cards) {
          runSql('INSERT INTO guild_cards (book_id, name, position, rarity) VALUES (?,?,?,?)', [br.lastInsertRowid, c.n, c.p, c.r]);
        }
      }
      console.log('[초기화] 스티커북 20종 / 카드 180장 기초 데이터 삽입 완료');
    }
  }

  // 활동 로그 헬퍼
  function addLog(userId, userName, action, detail, targetType, targetId) {
    try {
      runSql('INSERT INTO activity_logs (user_id, user_name, action, detail, target_type, target_id) VALUES (?,?,?,?,?,?)',
        [userId || 0, userName || 'system', action, detail || '', targetType || '', targetId || 0]);
    } catch(e) {}
  }

  // 알림 헬퍼
  function addNotification(userId, title, message, type, link) {
    try {
      runSql('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)',
        [userId, title, message || '', type || 'info', link || '']);
    } catch(e) {}
  }

  // 관리자 계정 초기화
  const adminExists = getSql('SELECT id FROM users WHERE role = ?', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin1234', 10);
    runSql('INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)', ['admin', hash, '관리자', 'admin']);
    console.log('관리자 계정 생성됨 (ID: admin / PW: ' + (process.env.ADMIN_PASSWORD || 'admin1234') + ')');
  }

  // 기본 세무 일정 삽입
  const taxCount = getSql('SELECT COUNT(*) as cnt FROM tax_events');
  if (taxCount.cnt === 0) {
    const taxEvents = [
      { title: '부가가치세 확정신고 (2기)', desc: '전년도 7~12월분 부가가치세 확정신고 및 납부', date: '2026-01-25', month: 1, day: 25 },
      { title: '면세사업자 사업장현황신고', desc: '면세사업자 전년도 사업장 현황 신고', date: '2026-02-10', month: 2, day: 10 },
      { title: '원천세 반기납부 신고', desc: '전년도 하반기(7~12월) 원천세 반기납부', date: '2026-01-10', month: 1, day: 10 },
      { title: '종합소득세 확정신고', desc: '전년도 종합소득세 확정신고 및 납부 기한', date: '2026-05-31', month: 5, day: 31 },
      { title: '부가가치세 예정신고 (1기)', desc: '1~3월분 부가가치세 예정신고 및 납부', date: '2026-04-25', month: 4, day: 25 },
      { title: '부가가치세 확정신고 (1기)', desc: '1~6월분 부가가치세 확정신고 및 납부', date: '2026-07-25', month: 7, day: 25 },
      { title: '부가가치세 예정신고 (2기)', desc: '7~9월분 부가가치세 예정신고 및 납부', date: '2026-10-25', month: 10, day: 25 },
      { title: '건강보험료 연말정산 (직장가입자)', desc: '건강보험료 보수총액 신고 및 정산', date: '2026-03-10', month: 3, day: 10 },
      { title: '지방소득세 신고', desc: '종합소득세분 지방소득세 신고 및 납부', date: '2026-05-31', month: 5, day: 31 },
      { title: '원천세 신고/납부', desc: '매월 원천징수한 세금 신고 및 납부 (매월 10일)', date: '2026-01-10', month: 0, day: 10 },
      { title: '4대보험 보수총액신고', desc: '전년도 4대보험 보수총액 신고', date: '2026-03-15', month: 3, day: 15 },
      { title: '소규모 사업자 부가세 감면 신청', desc: '연 매출 8천만원 이하 간이과세자 부가세 감면', date: '2026-01-25', month: 1, day: 25 },
      { title: '중소기업 정책자금 신청 (1차)', desc: '중소벤처기업부 정책자금 상반기 신청', date: '2026-02-01', month: 2, day: 1 },
      { title: '고용안정장려금 신청', desc: '고용유지지원금, 워라밸일자리장려금 등 신청', date: '2026-01-31', month: 1, day: 31 },
      { title: '소상공인 역량강화 사업 신청', desc: '소상공인시장진흥공단 역량강화 프로그램', date: '2026-03-01', month: 3, day: 1 },
    ];
    for (const e of taxEvents) {
      runSql('INSERT INTO tax_events (title, description, event_date, is_recurring, recurring_month, recurring_day) VALUES (?, ?, ?, 1, ?, ?)',
        [e.title, e.desc, e.date, e.month, e.day]);
    }
    console.log('기본 세무 일정 등록 완료');
  }

  // ============ 미들웨어 ============
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  }));

  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다' });
    next();
  }
  function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다' });
    next();
  }

  // ============ 인증 API ============
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = getSql('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 틀립니다' });
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.displayName = user.display_name;

    let freelancerId = null;
    if (user.role === 'freelancer') {
      const fl = getSql('SELECT id FROM freelancers WHERE user_id = ?', [user.id]);
      if (fl) freelancerId = fl.id;
    }
    req.session.freelancerId = freelancerId;
    res.json({ success: true, role: user.role, displayName: user.display_name, freelancerId });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    res.json({
      loggedIn: true,
      userId: req.session.userId,
      role: req.session.role,
      displayName: req.session.displayName,
      freelancerId: req.session.freelancerId
    });
  });

  app.post('/api/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = getSql('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: '현재 비밀번호가 틀립니다' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    runSql('UPDATE users SET password = ? WHERE id = ?', [hash, req.session.userId]);
    res.json({ success: true });
  });

  // ============ 프리랜서 관리 API ============
  app.get('/api/freelancers', requireAdmin, (req, res) => {
    const freelancers = allSql(`
      SELECT f.*, u.username
      FROM freelancers f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.active DESC, f.name ASC
    `);
    res.json(freelancers);
  });

  app.post('/api/freelancers', requireAdmin, (req, res) => {
    const { name, email, phone, unit_price, drive_folder_url, file_extensions, memo, username, password } = req.body;
    let driveFolderId = '';
    if (drive_folder_url) {
      const match = drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) driveFolderId = match[1];
    }
    const hash = bcrypt.hashSync(password || '1234', 10);
    const uname = username || name.replace(/\s/g, '').toLowerCase();
    try {
      // 이미 존재하는 아이디 체크
      const existing = getSql('SELECT id FROM users WHERE username = ?', [uname]);
      if (existing) {
        // 혹시 유령 계정(users에는 있지만 freelancers에는 없는 경우)이면 정리
        const hasFreelancer = getSql('SELECT id FROM freelancers WHERE user_id = ?', [existing.id]);
        if (!hasFreelancer) {
          runSql('DELETE FROM users WHERE id = ?', [existing.id]);
        } else {
          return res.status(400).json({ error: '이미 존재하는 아이디입니다. 다른 아이디를 입력하세요.' });
        }
      }

      const userResult = runSql('INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)', [uname, hash, name, 'freelancer']);
      const flResult = runSql(`
        INSERT INTO freelancers (user_id, name, email, phone, unit_price, drive_folder_id, drive_folder_url, file_extensions, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userResult.lastInsertRowid, name, email || '', phone || '', unit_price || 0, driveFolderId, drive_folder_url || '', file_extensions || '', memo || '']);
      res.json({ success: true, id: flResult.lastInsertRowid, username: uname });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/freelancers/:id', requireAdmin, (req, res) => {
    const { name, email, phone, unit_price, drive_folder_url, file_extensions, memo, active } = req.body;
    let driveFolderId = '';
    if (drive_folder_url) {
      const match = drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) driveFolderId = match[1];
    }
    runSql(`
      UPDATE freelancers SET name=?, email=?, phone=?, unit_price=?,
      drive_folder_id=?, drive_folder_url=?, file_extensions=?, memo=?, active=?
      WHERE id=?
    `, [name, email || '', phone || '', unit_price || 0, driveFolderId, drive_folder_url || '', file_extensions || '', memo || '', active !== undefined ? active : 1, parseInt(req.params.id)]);

    const fl = getSql('SELECT user_id FROM freelancers WHERE id = ?', [parseInt(req.params.id)]);
    if (fl && fl.user_id) {
      runSql('UPDATE users SET display_name = ? WHERE id = ?', [name, fl.user_id]);
    }
    res.json({ success: true });
  });

  app.delete('/api/freelancers/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const fl = getSql('SELECT user_id FROM freelancers WHERE id = ?', [id]);
    runSql('DELETE FROM drive_files WHERE freelancer_id = ?', [id]);
    runSql('DELETE FROM freelancers WHERE id = ?', [id]);
    if (fl && fl.user_id) {
      runSql('DELETE FROM users WHERE id = ?', [fl.user_id]);
    }
    res.json({ success: true });
  });

  app.post('/api/freelancers/:id/reset-password', requireAdmin, (req, res) => {
    const { newPassword } = req.body;
    const fl = getSql('SELECT user_id FROM freelancers WHERE id = ?', [parseInt(req.params.id)]);
    if (!fl || !fl.user_id) return res.status(404).json({ error: '프리랜서를 찾을 수 없습니다' });
    const hash = bcrypt.hashSync(newPassword || '1234', 10);
    runSql('UPDATE users SET password = ? WHERE id = ?', [hash, fl.user_id]);
    res.json({ success: true });
  });

  // ============ 파일 API ============
  app.get('/api/files', requireAuth, (req, res) => {
    const { freelancer_id, year, month } = req.query;
    let query = 'SELECT df.*, f.name as freelancer_name FROM drive_files df JOIN freelancers f ON df.freelancer_id = f.id WHERE 1=1';
    const params = [];

    if (req.session.role === 'freelancer') {
      query += ' AND df.freelancer_id = ?';
      params.push(req.session.freelancerId);
    } else if (freelancer_id) {
      query += ' AND df.freelancer_id = ?';
      params.push(parseInt(freelancer_id));
    }
    if (year) { query += ' AND df.year = ?'; params.push(parseInt(year)); }
    if (month) { query += ' AND df.month = ?'; params.push(parseInt(month)); }
    query += ' ORDER BY df.uploaded_at DESC';

    const files = allSql(query, params);
    res.json(files);
  });

  app.post('/api/files', requireAdmin, (req, res) => {
    const { freelancer_id, file_name, uploaded_at, uploader_name } = req.body;
    const date = new Date(uploaded_at || Date.now());
    const result = runSql(`
      INSERT INTO drive_files (freelancer_id, file_name, uploader_name, uploaded_at, year, month)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [parseInt(freelancer_id), file_name, uploader_name || '', date.toISOString(), date.getFullYear(), date.getMonth() + 1]);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.delete('/api/files/:id', requireAdmin, (req, res) => {
    runSql('DELETE FROM drive_files WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // ============ 정산 API ============
  app.get('/api/summary', requireAuth, (req, res) => {
    const { year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);
    let summary;

    if (req.session.role === 'freelancer') {
      summary = allSql(`
        SELECT f.id, f.name, f.unit_price, COUNT(df.id) as file_count,
               (f.unit_price * COUNT(df.id)) as total_amount
        FROM freelancers f
        LEFT JOIN drive_files df ON f.id = df.freelancer_id AND df.year = ? AND df.month = ?
        WHERE f.id = ?
        GROUP BY f.id
      `, [y, m, req.session.freelancerId]);
    } else {
      summary = allSql(`
        SELECT f.id, f.name, f.unit_price, f.active, COUNT(df.id) as file_count,
               (f.unit_price * COUNT(df.id)) as total_amount
        FROM freelancers f
        LEFT JOIN drive_files df ON f.id = df.freelancer_id AND df.year = ? AND df.month = ?
        GROUP BY f.id
        ORDER BY f.active DESC, f.name ASC
      `, [y, m]);
    }
    const grandTotal = summary.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    res.json({ summary, grandTotal });
  });

  // ============ 이벤트 API ============
  app.get('/api/events', requireAuth, (req, res) => {
    const { year } = req.query;
    const taxEvents = allSql('SELECT * FROM tax_events ORDER BY event_date');
    const customEvents = allSql('SELECT * FROM custom_events ORDER BY event_date');
    const currentYear = parseInt(year) || new Date().getFullYear();

    const adjustedTaxEvents = taxEvents.map(e => {
      if (e.is_recurring && e.recurring_month > 0) {
        const adjustedDate = `${currentYear}-${String(e.recurring_month).padStart(2, '0')}-${String(e.recurring_day).padStart(2, '0')}`;
        return { ...e, event_date: adjustedDate, type: 'tax' };
      }
      if (e.is_recurring && e.recurring_month === 0) {
        const events = [];
        for (let mo = 1; mo <= 12; mo++) {
          events.push({
            ...e,
            event_date: `${currentYear}-${String(mo).padStart(2, '0')}-${String(e.recurring_day).padStart(2, '0')}`,
            title: `${e.title} (${mo}월)`,
            type: 'tax'
          });
        }
        return events;
      }
      return { ...e, type: 'tax' };
    }).flat();

    const allEvents = [
      ...adjustedTaxEvents,
      ...customEvents.map(e => ({ ...e, type: 'custom' }))
    ];
    res.json(allEvents);
  });

  app.post('/api/events', requireAdmin, (req, res) => {
    const { title, description, event_date, event_end_date, category } = req.body;
    const result = runSql(`
      INSERT INTO custom_events (title, description, event_date, event_end_date, category)
      VALUES (?, ?, ?, ?, ?)
    `, [title, description || '', event_date, event_end_date || '', category || 'custom']);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.delete('/api/events/:id', requireAdmin, (req, res) => {
    const { type } = req.query;
    const id = parseInt(req.params.id);
    if (type === 'tax') {
      runSql('DELETE FROM tax_events WHERE id = ?', [id]);
    } else {
      runSql('DELETE FROM custom_events WHERE id = ?', [id]);
    }
    res.json({ success: true });
  });

  // ============ Google Drive 동기화 ============
  let driveService = null;

  async function initDriveService() {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Google Drive API 미설정 (수동 등록 모드)');
      return null;
    }
    try {
      const { google } = require('googleapis');
      const auth = new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/drive.readonly']
      );
      driveService = google.drive({ version: 'v3', auth });
      console.log('Google Drive API 연결 성공!');
      return driveService;
    } catch (e) {
      console.log('Google Drive API 연결 실패:', e.message);
      return null;
    }
  }

  // 하위 폴더까지 재귀적으로 모든 파일을 읽는 함수
  // allowedExts: 허용 확장자 배열 (예: ['.mp4','.mov']) 비어있으면 전체 허용
  async function syncDriveFiles(freelancerId, folderId, allowedExts) {
    if (!driveService || !folderId) return { added: 0, error: null };
    let totalAdded = 0;

    async function scanFolder(currentFolderId, folderPath) {
      try {
        const response = await driveService.files.list({
          q: `'${currentFolderId}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, size, createdTime, owners)',
          orderBy: 'createdTime desc',
          pageSize: 200
        });

        for (const file of response.data.files || []) {
          // 하위 폴더면 재귀적으로 들어감
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            await scanFolder(file.id, folderPath ? `${folderPath}/${file.name}` : file.name);
            continue;
          }

          // 확장자 필터링: allowedExts가 있으면 해당 확장자만 통과
          if (allowedExts && allowedExts.length > 0) {
            const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
            if (!allowedExts.includes(ext)) continue; // 스킵
          }

          // 파일이면 DB에 등록
          const exists = getSql('SELECT id FROM drive_files WHERE file_id = ?', [file.id]);
          if (!exists) {
            const date = new Date(file.createdTime);
            const ownerName = file.owners ? file.owners[0].displayName : '';
            const displayName = folderPath ? `[${folderPath}] ${file.name}` : file.name;
            runSql(`
              INSERT INTO drive_files (freelancer_id, file_name, file_id, file_type, file_size, uploader_name, uploaded_at, year, month)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [freelancerId, displayName, file.id, file.mimeType, file.size || 0, ownerName, file.createdTime, date.getFullYear(), date.getMonth() + 1]);
            totalAdded++;
          }
        }
      } catch (e) {
        console.log(`폴더 스캔 오류 (${currentFolderId}):`, e.message);
      }
    }

    try {
      await scanFolder(folderId, '');
      return { added: totalAdded, error: null };
    } catch (e) {
      return { added: totalAdded, error: e.message };
    }
  }

  app.post('/api/sync-drive', requireAdmin, async (req, res) => {
    if (!driveService) {
      return res.status(400).json({ error: 'Google Drive API가 설정되지 않았습니다. .env 파일을 확인하세요.' });
    }
    const freelancers = allSql('SELECT id, name, drive_folder_id, file_extensions FROM freelancers WHERE active = 1 AND drive_folder_id != ""');
    const results = [];
    for (const fl of freelancers) {
      const exts = fl.file_extensions ? fl.file_extensions.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
      const result = await syncDriveFiles(fl.id, fl.drive_folder_id, exts);
      results.push({ name: fl.name, ...result });
    }
    res.json({ results });
  });

  app.post('/api/sync-drive/:freelancerId', requireAdmin, async (req, res) => {
    if (!driveService) return res.status(400).json({ error: 'Google Drive API가 설정되지 않았습니다.' });
    const fl = getSql('SELECT id, drive_folder_id, file_extensions FROM freelancers WHERE id = ?', [parseInt(req.params.freelancerId)]);
    if (!fl || !fl.drive_folder_id) return res.status(400).json({ error: '드라이브 폴더가 설정되지 않았습니다.' });
    const exts = fl.file_extensions ? fl.file_extensions.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
    const result = await syncDriveFiles(fl.id, fl.drive_folder_id, exts);
    res.json(result);
  });

  let syncInterval = null;
  function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
      if (!driveService) return;
      const freelancers = allSql('SELECT id, name, drive_folder_id, file_extensions FROM freelancers WHERE active = 1 AND drive_folder_id != ""');
      for (const fl of freelancers) {
        const exts = fl.file_extensions ? fl.file_extensions.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
        const result = await syncDriveFiles(fl.id, fl.drive_folder_id, exts);
        if (result.added > 0) console.log(`[자동동기화] ${fl.name}: ${result.added}개 새 파일`);
      }
    }, 5 * 60 * 1000);
    console.log('자동 동기화 시작 (5분 간격)');
  }

  // ============ 대시보드 ============
  app.get('/api/dashboard', requireAuth, (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (req.session.role === 'admin') {
      const totalFreelancers = getSql('SELECT COUNT(*) as cnt FROM freelancers WHERE active = 1').cnt;
      const monthFiles = getSql('SELECT COUNT(*) as cnt FROM drive_files WHERE year = ? AND month = ?', [year, month]).cnt;
      const monthTotalRow = getSql(`
        SELECT COALESCE(SUM(f.unit_price), 0) as total
        FROM drive_files df JOIN freelancers f ON df.freelancer_id = f.id
        WHERE df.year = ? AND df.month = ?
      `, [year, month]);
      const monthTotal = monthTotalRow ? monthTotalRow.total : 0;
      res.json({ totalFreelancers, monthFiles, monthTotal, year, month });
    } else {
      const monthFiles = getSql('SELECT COUNT(*) as cnt FROM drive_files WHERE freelancer_id = ? AND year = ? AND month = ?',
        [req.session.freelancerId, year, month]).cnt;
      const fl = getSql('SELECT unit_price FROM freelancers WHERE id = ?', [req.session.freelancerId]);
      const monthTotal = monthFiles * (fl ? fl.unit_price : 0);
      res.json({ monthFiles, monthTotal, unitPrice: fl ? fl.unit_price : 0, year, month });
    }
  });

  // ============ 연간 리포트 API ============
  app.get('/api/yearly-report', requireAuth, (req, res) => {
    const { year } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    let freelancers;

    if (req.session.role === 'freelancer') {
      freelancers = allSql('SELECT id, name, unit_price FROM freelancers WHERE id = ?', [req.session.freelancerId]);
    } else {
      freelancers = allSql('SELECT id, name, unit_price FROM freelancers WHERE active = 1 ORDER BY name');
    }

    const report = freelancers.map(fl => {
      const months = {};
      let yearTotal = 0;
      for (let m = 1; m <= 12; m++) {
        const row = getSql('SELECT COUNT(*) as cnt FROM drive_files WHERE freelancer_id = ? AND year = ? AND month = ?', [fl.id, y, m]);
        const cnt = row ? row.cnt : 0;
        months[m] = { count: cnt, amount: cnt * fl.unit_price };
        yearTotal += cnt;
      }
      return { ...fl, months, yearTotal, yearAmount: yearTotal * fl.unit_price };
    });

    const grandTotal = report.reduce((s, r) => s + r.yearAmount, 0);
    res.json({ year: y, report, grandTotal });
  });

  // ============ CSV 내보내기 API ============
  app.get('/api/export-csv', requireAdmin, (req, res) => {
    const { year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);

    const summary = allSql(`
      SELECT f.name, f.unit_price, COUNT(df.id) as file_count,
             (f.unit_price * COUNT(df.id)) as total_amount
      FROM freelancers f
      LEFT JOIN drive_files df ON f.id = df.freelancer_id AND df.year = ? AND df.month = ?
      WHERE f.active = 1
      GROUP BY f.id ORDER BY f.name
    `, [y, m]);

    // BOM + CSV 생성
    let csv = '\uFEFF프리랜서,건당단가,작업건수,총액,3.3%원천세,실지급액\n';
    for (const s of summary) {
      const tax = Math.floor(s.total_amount * 0.033);
      const net = s.total_amount - tax;
      csv += `${s.name},${s.unit_price},${s.file_count},${s.total_amount},${tax},${net}\n`;
    }
    const totalAmount = summary.reduce((s, r) => s + r.total_amount, 0);
    const totalTax = Math.floor(totalAmount * 0.033);
    csv += `합계,,${summary.reduce((s,r) => s + r.file_count, 0)},${totalAmount},${totalTax},${totalAmount - totalTax}\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=settlement_${y}_${m}.csv`);
    res.send(csv);
  });

  // ============ 월별 메모 API ============
  app.get('/api/memos', requireAuth, (req, res) => {
    const { freelancer_id, year, month } = req.query;
    if (req.session.role === 'freelancer') {
      const memo = getSql('SELECT * FROM monthly_memos WHERE freelancer_id = ? AND year = ? AND month = ?',
        [req.session.freelancerId, parseInt(year), parseInt(month)]);
      res.json(memo || null);
    } else {
      if (freelancer_id) {
        const memo = getSql('SELECT * FROM monthly_memos WHERE freelancer_id = ? AND year = ? AND month = ?',
          [parseInt(freelancer_id), parseInt(year), parseInt(month)]);
        res.json(memo || null);
      } else {
        const memos = allSql('SELECT mm.*, f.name as freelancer_name FROM monthly_memos mm JOIN freelancers f ON mm.freelancer_id = f.id WHERE mm.year = ? AND mm.month = ?',
          [parseInt(year), parseInt(month)]);
        res.json(memos);
      }
    }
  });

  app.post('/api/memos', requireAdmin, (req, res) => {
    const { freelancer_id, year, month, memo } = req.body;
    const existing = getSql('SELECT id FROM monthly_memos WHERE freelancer_id = ? AND year = ? AND month = ?',
      [freelancer_id, year, month]);
    if (existing) {
      runSql('UPDATE monthly_memos SET memo = ? WHERE id = ?', [memo, existing.id]);
    } else {
      runSql('INSERT INTO monthly_memos (freelancer_id, year, month, memo) VALUES (?, ?, ?, ?)',
        [freelancer_id, year, month, memo]);
    }
    res.json({ success: true });
  });

  // ============ 파일 상태(태그) API ============
  app.put('/api/files/:id/status', requireAdmin, (req, res) => {
    const { status } = req.body; // 'pending', 'reviewed', 'rejected'
    runSql('UPDATE drive_files SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
    const file = getSql('SELECT df.*, f.user_id as fl_user_id FROM drive_files df JOIN freelancers f ON df.freelancer_id = f.id WHERE df.id = ?', [parseInt(req.params.id)]);
    if (file && status === 'rejected' && file.fl_user_id) {
      addNotification(file.fl_user_id, '파일 반려', `"${file.file_name}" 파일이 반려되었습니다.`, 'warning', 'files');
    }
    addLog(req.session.userId, req.session.displayName, '파일 상태 변경', `${file ? file.file_name : ''} → ${status}`, 'file', parseInt(req.params.id));
    res.json({ success: true });
  });

  // ============ 정산 상태 관리 API ============
  app.get('/api/payments', requireAdmin, (req, res) => {
    const { year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);
    const payments = allSql(`
      SELECT pr.*, f.name as freelancer_name
      FROM payment_records pr
      JOIN freelancers f ON pr.freelancer_id = f.id
      WHERE pr.year = ? AND pr.month = ?
      ORDER BY f.name
    `, [y, m]);
    res.json(payments);
  });

  app.post('/api/payments', requireAdmin, (req, res) => {
    const { freelancer_id, year, month, amount, tax, net_amount, status, paid_at, memo } = req.body;
    const existing = getSql('SELECT id FROM payment_records WHERE freelancer_id = ? AND year = ? AND month = ?',
      [freelancer_id, year, month]);
    if (existing) {
      runSql('UPDATE payment_records SET amount=?, tax=?, net_amount=?, status=?, paid_at=?, memo=? WHERE id=?',
        [amount, tax, net_amount, status || 'unpaid', paid_at || '', memo || '', existing.id]);
    } else {
      runSql('INSERT INTO payment_records (freelancer_id, year, month, amount, tax, net_amount, status, paid_at, memo) VALUES (?,?,?,?,?,?,?,?,?)',
        [freelancer_id, year, month, amount, tax, net_amount, status || 'unpaid', paid_at || '', memo || '']);
    }
    addLog(req.session.userId, req.session.displayName, '정산 상태 변경',
      `프리랜서ID:${freelancer_id} ${year}/${month} → ${status}`, 'payment', freelancer_id);
    res.json({ success: true });
  });

  app.put('/api/payments/:freelancerId/pay', requireAdmin, (req, res) => {
    const { year, month } = req.body;
    const flId = parseInt(req.params.freelancerId);
    const summary = getSql(`
      SELECT f.unit_price, COUNT(df.id) as file_count
      FROM freelancers f LEFT JOIN drive_files df ON f.id = df.freelancer_id AND df.year = ? AND df.month = ?
      WHERE f.id = ? GROUP BY f.id
    `, [year, month, flId]);
    if (!summary) return res.status(404).json({ error: '프리랜서를 찾을 수 없습니다' });
    const amount = summary.unit_price * summary.file_count;
    const tax = Math.floor(amount * 0.033);
    const net = amount - tax;
    const now = new Date().toISOString();

    const existing = getSql('SELECT id FROM payment_records WHERE freelancer_id = ? AND year = ? AND month = ?', [flId, year, month]);
    if (existing) {
      runSql('UPDATE payment_records SET amount=?, tax=?, net_amount=?, status=?, paid_at=? WHERE id=?',
        [amount, tax, net, 'paid', now, existing.id]);
    } else {
      runSql('INSERT INTO payment_records (freelancer_id, year, month, amount, tax, net_amount, status, paid_at) VALUES (?,?,?,?,?,?,?,?)',
        [flId, year, month, amount, tax, net, 'paid', now]);
    }
    const fl = getSql('SELECT name, user_id FROM freelancers WHERE id = ?', [flId]);
    if (fl && fl.user_id) {
      addNotification(fl.user_id, '정산 완료', `${year}년 ${month}월 정산금 ${formatWon(net)}이 지급되었습니다.`, 'success', 'settlement');
    }
    addLog(req.session.userId, req.session.displayName, '지급 완료', `${fl ? fl.name : ''} ${year}/${month} ${formatWon(net)}`, 'payment', flId);
    res.json({ success: true });
  });

  function formatWon(n) { return (n || 0).toLocaleString('ko-KR') + '원'; }

  // ============ 계약 관리 API ============
  app.get('/api/contracts', requireAuth, (req, res) => {
    const { freelancer_id } = req.query;
    let contracts;
    if (req.session.role === 'freelancer') {
      contracts = allSql('SELECT c.*, f.name as freelancer_name FROM contracts c JOIN freelancers f ON c.freelancer_id = f.id WHERE c.freelancer_id = (SELECT id FROM freelancers WHERE user_id = ?) ORDER BY c.start_date DESC', [req.session.userId]);
    } else if (freelancer_id) {
      contracts = allSql('SELECT c.*, f.name as freelancer_name FROM contracts c JOIN freelancers f ON c.freelancer_id = f.id WHERE c.freelancer_id = ? ORDER BY c.start_date DESC', [parseInt(freelancer_id)]);
    } else {
      contracts = allSql('SELECT c.*, f.name as freelancer_name FROM contracts c JOIN freelancers f ON c.freelancer_id = f.id ORDER BY c.end_date ASC');
    }
    res.json(contracts);
  });

  app.post('/api/contracts', requireAdmin, (req, res) => {
    const { freelancer_id, start_date, end_date, unit_price, description } = req.body;
    const result = runSql('INSERT INTO contracts (freelancer_id, start_date, end_date, unit_price, description) VALUES (?,?,?,?,?)',
      [freelancer_id, start_date, end_date, unit_price || 0, description || '']);
    addLog(req.session.userId, req.session.displayName, '계약 추가', `프리랜서ID:${freelancer_id} ${start_date}~${end_date}`, 'contract', result.lastInsertRowid);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/contracts/:id', requireAdmin, (req, res) => {
    const { start_date, end_date, unit_price, description, status } = req.body;
    runSql('UPDATE contracts SET start_date=?, end_date=?, unit_price=?, description=?, status=? WHERE id=?',
      [start_date, end_date, unit_price || 0, description || '', status || 'active', parseInt(req.params.id)]);
    res.json({ success: true });
  });

  app.delete('/api/contracts/:id', requireAdmin, (req, res) => {
    runSql('DELETE FROM contracts WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // 계약 만료 경고 API
  app.get('/api/contracts/expiring', requireAdmin, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    const expiring = allSql(`
      SELECT c.*, f.name as freelancer_name
      FROM contracts c JOIN freelancers f ON c.freelancer_id = f.id
      WHERE c.status = 'active' AND c.end_date >= ? AND c.end_date <= ?
      ORDER BY c.end_date ASC
    `, [today, in30]);
    res.json(expiring);
  });

  // ============ 활동 로그 API ============
  app.get('/api/logs', requireAdmin, (req, res) => {
    const { limit: lim } = req.query;
    const l = parseInt(lim) || 50;
    const logs = allSql('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?', [l]);
    res.json(logs);
  });

  // ============ 메시지/소통 API ============
  app.get('/api/messages', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const messages = allSql(`
      SELECT * FROM messages
      WHERE sender_id = ? OR receiver_id = ? OR receiver_id IS NULL
      ORDER BY created_at DESC LIMIT 100
    `, [userId, userId]);
    res.json(messages);
  });

  app.post('/api/messages', requireAuth, (req, res) => {
    const { receiver_id, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '메시지를 입력하세요' });
    let receiverName = '전체';
    if (receiver_id) {
      const u = getSql('SELECT display_name FROM users WHERE id = ?', [receiver_id]);
      if (u) receiverName = u.display_name;
    }
    runSql('INSERT INTO messages (sender_id, sender_name, receiver_id, receiver_name, content) VALUES (?,?,?,?,?)',
      [req.session.userId, req.session.displayName, receiver_id || null, receiverName, content.trim()]);
    if (receiver_id) {
      addNotification(receiver_id, '새 메시지', `${req.session.displayName}님이 메시지를 보냈습니다.`, 'info', 'messages');
    }
    addLog(req.session.userId, req.session.displayName, '메시지 전송', `→ ${receiverName}`, 'message', 0);
    res.json({ success: true });
  });

  app.get('/api/messages/unread-count', requireAuth, (req, res) => {
    const row = getSql('SELECT COUNT(*) as cnt FROM messages WHERE receiver_id = ? AND is_read = 0', [req.session.userId]);
    res.json({ count: row ? row.cnt : 0 });
  });

  app.post('/api/messages/mark-read', requireAuth, (req, res) => {
    runSql('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND is_read = 0', [req.session.userId]);
    res.json({ success: true });
  });

  // ============ 파일 코멘트 API ============
  app.get('/api/files/:id/comments', requireAuth, (req, res) => {
    const comments = allSql('SELECT * FROM file_comments WHERE file_id = ? ORDER BY created_at ASC', [parseInt(req.params.id)]);
    res.json(comments);
  });

  app.post('/api/files/:id/comments', requireAuth, (req, res) => {
    const { comment } = req.body;
    if (!comment || !comment.trim()) return res.status(400).json({ error: '코멘트를 입력하세요' });
    runSql('INSERT INTO file_comments (file_id, user_id, user_name, comment) VALUES (?,?,?,?)',
      [parseInt(req.params.id), req.session.userId, req.session.displayName, comment.trim()]);
    // 파일 소유자에게 알림
    const file = getSql('SELECT df.file_name, f.user_id as fl_user_id FROM drive_files df JOIN freelancers f ON df.freelancer_id = f.id WHERE df.id = ?', [parseInt(req.params.id)]);
    if (file && file.fl_user_id && file.fl_user_id !== req.session.userId) {
      addNotification(file.fl_user_id, '파일 코멘트', `${req.session.displayName}님이 "${file.file_name}"에 코멘트를 남겼습니다.`, 'info', 'files');
    }
    res.json({ success: true });
  });

  // ============ 프로젝트 관리 API ============
  app.get('/api/projects', requireAuth, (req, res) => {
    const projects = allSql('SELECT * FROM projects ORDER BY active DESC, name ASC');
    res.json(projects);
  });

  app.post('/api/projects', requireAdmin, (req, res) => {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: '프로젝트 이름을 입력하세요' });
    const result = runSql('INSERT INTO projects (name, description, color) VALUES (?,?,?)',
      [name, description || '', color || '#3498db']);
    addLog(req.session.userId, req.session.displayName, '프로젝트 추가', name, 'project', result.lastInsertRowid);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/projects/:id', requireAdmin, (req, res) => {
    const { name, description, color, active } = req.body;
    runSql('UPDATE projects SET name=?, description=?, color=?, active=? WHERE id=?',
      [name, description || '', color || '#3498db', active !== undefined ? active : 1, parseInt(req.params.id)]);
    res.json({ success: true });
  });

  app.delete('/api/projects/:id', requireAdmin, (req, res) => {
    runSql('UPDATE drive_files SET project_id = NULL WHERE project_id = ?', [parseInt(req.params.id)]);
    runSql('DELETE FROM projects WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // 파일에 프로젝트 배정
  app.put('/api/files/:id/project', requireAdmin, (req, res) => {
    const { project_id } = req.body;
    runSql('UPDATE drive_files SET project_id = ? WHERE id = ?', [project_id || null, parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // ============ 알림 API ============
  app.get('/api/notifications', requireAuth, (req, res) => {
    const notifs = allSql('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [req.session.userId]);
    res.json(notifs);
  });

  app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
    const row = getSql('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0', [req.session.userId]);
    res.json({ count: row ? row.cnt : 0 });
  });

  app.post('/api/notifications/mark-read', requireAuth, (req, res) => {
    runSql('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.session.userId]);
    res.json({ success: true });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
    runSql('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.session.userId]);
    res.json({ success: true });
  });

  // ============ 인보이스 PDF(HTML) 생성 API ============
  app.get('/api/invoice', requireAuth, (req, res) => {
    const { freelancer_id, year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);

    let flId = freelancer_id ? parseInt(freelancer_id) : null;
    if (req.session.role === 'freelancer') flId = req.session.freelancerId;
    if (!flId) return res.status(400).json({ error: '프리랜서 ID가 필요합니다' });

    const fl = getSql('SELECT * FROM freelancers WHERE id = ?', [flId]);
    if (!fl) return res.status(404).json({ error: '프리랜서를 찾을 수 없습니다' });

    const files = allSql('SELECT * FROM drive_files WHERE freelancer_id = ? AND year = ? AND month = ? ORDER BY uploaded_at', [flId, y, m]);
    const totalAmount = fl.unit_price * files.length;
    const tax = Math.floor(totalAmount * 0.033);
    const net = totalAmount - tax;

    const invoiceHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>인보이스 - ${fl.name} ${y}년 ${m}월</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333;}
h1{color:#302b63;text-align:center;border-bottom:3px solid #302b63;padding-bottom:16px;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0;}
.info-box{background:#f8f9fa;padding:16px;border-radius:8px;}
.info-box h3{font-size:14px;color:#888;margin-bottom:8px;}
table{width:100%;border-collapse:collapse;margin:24px 0;}
th{background:#302b63;color:#fff;padding:10px 12px;text-align:left;font-size:13px;}
td{padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;}
tr:nth-child(even){background:#f8f9fa;}
.total-section{background:#f0f2f5;padding:20px;border-radius:8px;margin-top:24px;}
.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:15px;}
.total-row.final{font-size:20px;font-weight:700;color:#302b63;border-top:2px solid #302b63;margin-top:8px;padding-top:12px;}
.footer{text-align:center;margin-top:40px;color:#888;font-size:12px;}
@media print{body{padding:20px;} .no-print{display:none;}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:12px 32px;background:#302b63;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">🖨️ 인쇄 / PDF 저장</button>
</div>
<h1>인 보 이 스</h1>
<div class="info-grid">
  <div class="info-box"><h3>수신</h3><p><strong>${fl.name}</strong></p><p>${fl.email || ''}</p><p>${fl.phone || ''}</p></div>
  <div class="info-box"><h3>정산 기간</h3><p><strong>${y}년 ${m}월</strong></p><p>발행일: ${new Date().toISOString().split('T')[0]}</p></div>
</div>
<h3>📋 작업 내역 (총 ${files.length}건)</h3>
<table>
<thead><tr><th>No.</th><th>파일명</th><th>업로드 일시</th><th style="text-align:right;">단가</th></tr></thead>
<tbody>${files.map((f, i) => `<tr><td>${i+1}</td><td>${f.file_name}</td><td>${f.uploaded_at ? f.uploaded_at.substring(0,16) : '-'}</td><td style="text-align:right;">${(fl.unit_price||0).toLocaleString()}원</td></tr>`).join('')}
${files.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#888;">작업 내역이 없습니다</td></tr>' : ''}
</tbody></table>
<div class="total-section">
  <div class="total-row"><span>작업 건수</span><span>${files.length}건 × ${(fl.unit_price||0).toLocaleString()}원</span></div>
  <div class="total-row"><span>총 금액</span><span>${totalAmount.toLocaleString()}원</span></div>
  <div class="total-row"><span>3.3% 원천세</span><span style="color:#e74c3c;">-${tax.toLocaleString()}원</span></div>
  <div class="total-row final"><span>실 지급액</span><span>${net.toLocaleString()}원</span></div>
</div>
<div class="footer"><p>본 인보이스는 프리랜서 관리 시스템에서 자동 생성되었습니다.</p></div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(invoiceHtml);
  });

  // ============ 파일 검색/필터 강화 API ============
  app.get('/api/files/search', requireAuth, (req, res) => {
    const { keyword, status, freelancer_id, year, month, project_id } = req.query;
    let query = 'SELECT df.*, f.name as freelancer_name, p.name as project_name FROM drive_files df JOIN freelancers f ON df.freelancer_id = f.id LEFT JOIN projects p ON df.project_id = p.id WHERE 1=1';
    const params = [];

    if (req.session.role === 'freelancer') { query += ' AND df.freelancer_id = ?'; params.push(req.session.freelancerId); }
    else if (freelancer_id) { query += ' AND df.freelancer_id = ?'; params.push(parseInt(freelancer_id)); }
    if (keyword) { query += ' AND df.file_name LIKE ?'; params.push(`%${keyword}%`); }
    if (status) { query += ' AND df.status = ?'; params.push(status); }
    if (year) { query += ' AND df.year = ?'; params.push(parseInt(year)); }
    if (month) { query += ' AND df.month = ?'; params.push(parseInt(month)); }
    if (project_id) { query += ' AND df.project_id = ?'; params.push(parseInt(project_id)); }
    query += ' ORDER BY df.uploaded_at DESC LIMIT 200';

    const files = allSql(query, params);
    res.json(files);
  });

  // ============ 비교 분석 API ============
  app.get('/api/analytics/compare', requireAdmin, (req, res) => {
    const { year } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const freelancers = allSql('SELECT id, name, unit_price FROM freelancers WHERE active = 1 ORDER BY name');

    const comparison = freelancers.map(fl => {
      const totalRow = getSql('SELECT COUNT(*) as cnt FROM drive_files WHERE freelancer_id = ? AND year = ?', [fl.id, y]);
      const total = totalRow ? totalRow.cnt : 0;
      const months = {};
      for (let m = 1; m <= 12; m++) {
        const r = getSql('SELECT COUNT(*) as cnt FROM drive_files WHERE freelancer_id = ? AND year = ? AND month = ?', [fl.id, y, m]);
        months[m] = r ? r.cnt : 0;
      }
      const avgPerMonth = total > 0 ? (total / 12).toFixed(1) : 0;
      return { ...fl, totalFiles: total, totalAmount: total * fl.unit_price, avgPerMonth: parseFloat(avgPerMonth), months };
    });

    // MVP: 가장 작업량 많은 프리랜서
    const mvp = comparison.length > 0 ? comparison.reduce((a, b) => a.totalFiles > b.totalFiles ? a : b) : null;
    // 월별 전체 지출 추이
    const monthlyExpenses = {};
    for (let m = 1; m <= 12; m++) {
      monthlyExpenses[m] = comparison.reduce((s, fl) => s + (fl.months[m] * fl.unit_price), 0);
    }

    res.json({ year: y, comparison, mvp, monthlyExpenses, totalExpense: comparison.reduce((s,c) => s + c.totalAmount, 0) });
  });

  // 로그인 시 활동 로그 기록 - 기존 login 라우트 활용 위해 미들웨어 추가
  // (기존 login API에 로그 추가는 복잡하므로 별도 처리)

  // ============ 관리자 대시보드 강화 API ============
  app.get('/api/dashboard-detail', requireAdmin, (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // 이번달 / 지난달 비교
    const thisMonth = getSql('SELECT COUNT(*) as files FROM drive_files WHERE year=? AND month=?', [year, month]);
    const lastMonth = getSql('SELECT COUNT(*) as files FROM drive_files WHERE year=? AND month=?', [prevYear, prevMonth]);
    const thisTotal = getSql('SELECT COALESCE(SUM(f.unit_price),0) as total FROM drive_files df JOIN freelancers f ON df.freelancer_id=f.id WHERE df.year=? AND df.month=?', [year, month]);
    const lastTotal = getSql('SELECT COALESCE(SUM(f.unit_price),0) as total FROM drive_files df JOIN freelancers f ON df.freelancer_id=f.id WHERE df.year=? AND df.month=?', [prevYear, prevMonth]);

    // 해야할 일: 미확인 파일, 미지급 건
    const pendingFiles = getSql("SELECT COUNT(*) as cnt FROM drive_files WHERE status='pending' OR status IS NULL");
    const rejectedFiles = getSql("SELECT COUNT(*) as cnt FROM drive_files WHERE status='rejected'");
    const unpaidCount = (() => {
      const fls = allSql('SELECT id FROM freelancers WHERE active=1');
      let cnt = 0;
      for (const fl of fls) {
        const fc = getSql('SELECT COUNT(*) as c FROM drive_files WHERE freelancer_id=? AND year=? AND month=?', [fl.id, year, month]);
        if (fc && fc.c > 0) {
          const paid = getSql("SELECT id FROM payment_records WHERE freelancer_id=? AND year=? AND month=? AND status='paid'", [fl.id, year, month]);
          if (!paid) cnt++;
        }
      }
      return cnt;
    })();

    // 만료예정 계약
    const today = now.toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    const expiringContracts = getSql("SELECT COUNT(*) as cnt FROM contracts WHERE status='active' AND end_date>=? AND end_date<=?", [today, in30]);

    res.json({
      thisMonthFiles: thisMonth ? thisMonth.files : 0,
      lastMonthFiles: lastMonth ? lastMonth.files : 0,
      thisMonthTotal: thisTotal ? thisTotal.total : 0,
      lastMonthTotal: lastTotal ? lastTotal.total : 0,
      pendingFiles: pendingFiles ? pendingFiles.cnt : 0,
      rejectedFiles: rejectedFiles ? rejectedFiles.cnt : 0,
      unpaidCount,
      expiringContracts: expiringContracts ? expiringContracts.cnt : 0
    });
  });

  // ============ 파일 중복 체크 API ============
  app.get('/api/files/duplicates', requireAdmin, (req, res) => {
    const dupes = allSql(`
      SELECT file_name, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
      FROM drive_files
      GROUP BY file_name, freelancer_id
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 50
    `);
    res.json(dupes);
  });

  // ============ 정산 스케줄 설정 API ============
  app.get('/api/settings/payment-day', requireAdmin, (req, res) => {
    const row = getSql("SELECT value FROM settings WHERE key='payment_day'");
    res.json({ paymentDay: row ? parseInt(row.value) : 10 });
  });

  app.post('/api/settings/payment-day', requireAdmin, (req, res) => {
    const { day } = req.body;
    const d = parseInt(day) || 10;
    const existing = getSql("SELECT key FROM settings WHERE key='payment_day'");
    if (existing) {
      runSql("UPDATE settings SET value=? WHERE key='payment_day'", [String(d)]);
    } else {
      runSql("INSERT INTO settings (key, value) VALUES ('payment_day', ?)", [String(d)]);
    }
    res.json({ success: true });
  });

  // ============ 기본 확장자 설정 API ============
  app.get('/api/settings/default-extensions', requireAdmin, (req, res) => {
    const row = getSql("SELECT value FROM settings WHERE key='default_extensions'");
    res.json({ extensions: row ? row.value : DEFAULT_VIDEO_EXTENSIONS });
  });

  app.post('/api/settings/default-extensions', requireAdmin, (req, res) => {
    const { extensions } = req.body;
    const ext = (extensions || DEFAULT_VIDEO_EXTENSIONS).trim();
    const existing = getSql("SELECT key FROM settings WHERE key='default_extensions'");
    if (existing) {
      runSql("UPDATE settings SET value=? WHERE key='default_extensions'", [ext]);
    } else {
      runSql("INSERT INTO settings (key, value) VALUES ('default_extensions', ?)", [ext]);
    }
    res.json({ success: true });
  });

  // 모든 프리랜서에 확장자 일괄 적용
  app.post('/api/settings/apply-extensions-all', requireAdmin, (req, res) => {
    const { extensions } = req.body;
    const ext = (extensions || DEFAULT_VIDEO_EXTENSIONS).trim();
    db.run("UPDATE freelancers SET file_extensions = ? WHERE active = 1", [ext]);
    saveDb();
    const count = allSql("SELECT id FROM freelancers WHERE active = 1").length;
    res.json({ success: true, message: `${count}명의 프리랜서에 확장자 설정 적용 완료` });
  });

  // 비영상 파일 정리 (영상 확장자가 아닌 파일 삭제)
  app.post('/api/files/cleanup-non-video', requireAdmin, (req, res) => {
    const videoExts = DEFAULT_VIDEO_EXTENSIONS.split(',').map(e => e.trim().toLowerCase());
    const allFiles = allSql("SELECT id, file_name FROM drive_files");
    let deletedCount = 0;
    for (const file of allFiles) {
      const ext = '.' + (file.file_name.replace(/^\[.*?\]\s*/, '').split('.').pop() || '').toLowerCase();
      if (!videoExts.includes(ext)) {
        db.run("DELETE FROM drive_files WHERE id = ?", [file.id]);
        deletedCount++;
      }
    }
    if (deletedCount > 0) saveDb();
    res.json({ success: true, deleted: deletedCount, message: `비영상 파일 ${deletedCount}건 삭제 완료` });
  });

  // ============ DB 백업/복원 API ============
  app.get('/api/backup', requireAdmin, (req, res) => {
    const data = db.export();
    const buffer = Buffer.from(data);
    const filename = `freelancer_backup_${new Date().toISOString().slice(0,10)}.db`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  });

  app.post('/api/restore', requireAdmin, express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
    try {
      const SQL = await initSqlJs({
        locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
      });
      const testDb = new SQL.Database(new Uint8Array(req.body));
      // 기본 검증: users 테이블이 있는지
      const check = testDb.exec("SELECT COUNT(*) FROM users");
      if (!check || check.length === 0) {
        testDb.close();
        return res.status(400).json({ error: '유효하지 않은 데이터베이스 파일입니다' });
      }
      // 기존 DB 백업 후 교체
      const backupPath = DB_PATH + '.bak';
      if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, backupPath);
      db = testDb;
      saveDb();
      res.json({ success: true, message: '데이터베이스가 복원되었습니다. 페이지를 새로고침하세요.' });
    } catch (e) {
      res.status(400).json({ error: '복원 실패: ' + e.message });
    }
  });

  // ============ 파일 태그/메모 API ============
  app.put('/api/files/:id/tag', requireAdmin, (req, res) => {
    const { tag } = req.body;
    try { db.run("ALTER TABLE drive_files ADD COLUMN tag TEXT DEFAULT ''"); saveDb(); } catch(e) {}
    runSql('UPDATE drive_files SET tag = ? WHERE id = ?', [tag || '', parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // 기존 DB에 tag 컬럼 추가
  try { db.run("ALTER TABLE drive_files ADD COLUMN tag TEXT DEFAULT ''"); saveDb(); } catch(e) {}

  // ============ 이메일 알림 (시뮬레이션 - 실제 전송은 추후) ============
  app.post('/api/send-notification-email', requireAdmin, (req, res) => {
    const { freelancer_id, type, year, month } = req.body;
    const fl = getSql('SELECT * FROM freelancers WHERE id = ?', [parseInt(freelancer_id)]);
    if (!fl) return res.status(404).json({ error: '프리랜서를 찾을 수 없습니다' });
    if (!fl.email) return res.status(400).json({ error: `${fl.name}님의 이메일이 등록되지 않았습니다` });

    // 알림 기록 저장
    if (fl.user_id) {
      if (type === 'payment') {
        addNotification(fl.user_id, '정산 알림', `${year}년 ${month}월 정산이 완료되었습니다. 이메일(${fl.email})로 상세 내역이 발송되었습니다.`, 'success', 'settlement');
      } else if (type === 'contract_expiry') {
        addNotification(fl.user_id, '계약 만료 알림', '계약 만료가 임박합니다. 관리자에게 연락하세요.', 'warning', 'contracts');
      }
    }
    addLog(req.session.userId, req.session.displayName, '알림 발송', `${fl.name} (${fl.email}) - ${type}`, 'notification', fl.id);
    res.json({ success: true, message: `${fl.name}님(${fl.email})에게 알림이 발송되었습니다.` });
  });

  // ============ 일괄 인보이스 API ============
  app.get('/api/invoice-batch', requireAdmin, (req, res) => {
    const { year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);

    const freelancers = allSql('SELECT * FROM freelancers WHERE active = 1 ORDER BY name');
    let allHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>전체 인보이스 - ${y}년 ${m}월</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;margin:0;padding:20px;color:#333;}
.invoice-page{max-width:780px;margin:0 auto 40px;padding:40px;border:1px solid #ddd;border-radius:8px;page-break-after:always;}
.invoice-page:last-child{page-break-after:auto;}
h1{color:#302b63;text-align:center;border-bottom:3px solid #302b63;padding-bottom:12px;font-size:22px;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
.info-box{background:#f8f9fa;padding:14px;border-radius:8px;}
.info-box h3{font-size:13px;color:#888;margin:0 0 6px;}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;}
th{background:#302b63;color:#fff;padding:8px 10px;text-align:left;}
td{padding:8px 10px;border-bottom:1px solid #eee;}
.total-section{background:#f0f2f5;padding:16px;border-radius:8px;margin-top:16px;}
.total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;}
.total-row.final{font-size:18px;font-weight:700;color:#302b63;border-top:2px solid #302b63;margin-top:6px;padding-top:10px;}
.no-print{text-align:center;margin-bottom:20px;}
@media print{.no-print{display:none;} body{padding:0;}}
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:14px 40px;background:#302b63;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">🖨️ 전체 인쇄 / PDF 저장</button>
<span style="margin-left:16px;color:#888;">${freelancers.length}명 인보이스</span></div>`;

    for (const fl of freelancers) {
      const files = allSql('SELECT * FROM drive_files WHERE freelancer_id=? AND year=? AND month=? ORDER BY uploaded_at', [fl.id, y, m]);
      const totalAmount = fl.unit_price * files.length;
      const tax = Math.floor(totalAmount * 0.033);
      const net = totalAmount - tax;

      allHtml += `<div class="invoice-page">
<h1>인 보 이 스</h1>
<div class="info-grid">
  <div class="info-box"><h3>수신</h3><p><strong>${fl.name}</strong></p><p>${fl.email||''}</p><p>${fl.phone||''}</p></div>
  <div class="info-box"><h3>정산 기간</h3><p><strong>${y}년 ${m}월</strong></p><p>발행일: ${new Date().toISOString().split('T')[0]}</p></div>
</div>
<table><thead><tr><th>No.</th><th>파일명</th><th>업로드 일시</th><th style="text-align:right;">단가</th></tr></thead>
<tbody>${files.length > 0 ? files.map((f, i) => `<tr><td>${i+1}</td><td>${f.file_name}</td><td>${f.uploaded_at ? f.uploaded_at.substring(0,16) : '-'}</td><td style="text-align:right;">${(fl.unit_price||0).toLocaleString()}원</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#888;">작업 내역 없음</td></tr>'}</tbody></table>
<div class="total-section">
  <div class="total-row"><span>작업 건수</span><span>${files.length}건 x ${(fl.unit_price||0).toLocaleString()}원</span></div>
  <div class="total-row"><span>총 금액</span><span>${totalAmount.toLocaleString()}원</span></div>
  <div class="total-row"><span>3.3% 원천세</span><span style="color:#e74c3c;">-${tax.toLocaleString()}원</span></div>
  <div class="total-row final"><span>실 지급액</span><span>${net.toLocaleString()}원</span></div>
</div></div>`;
    }
    allHtml += '</body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(allHtml);
  });

  // ============ 라우팅 ============
  // ============ 업무위탁계약서 PDF(HTML) 생성 API ============
  app.post('/api/contract-document', requireAdmin, (req, res) => {
    const {
      freelancer_id,
      // 위탁자(갑) 정보
      company_ceo, company_phone,
      // 수탁자(을) 정보 - 프리랜서 기본정보 + 추가입력
      fl_name, fl_phone, fl_email, fl_birthdate, fl_bank, fl_account,
      // 계약 정보
      contract_date, work_start_date, contract_end_date,
      unit_price_input,
      // 업무 협의사항 (여러 줄)
      work_terms,
      // 특약사항
      special_terms
    } = req.body;

    const fl = getSql('SELECT * FROM freelancers WHERE id = ?', [parseInt(freelancer_id)]);
    if (!fl) return res.status(404).json({ error: '프리랜서를 찾을 수 없습니다' });

    const unitPrice = unit_price_input || fl.unit_price || 0;
    const today = contract_date || new Date().toISOString().split('T')[0];
    const flName = fl_name || fl.name;
    const flPhone = fl_phone || fl.phone || '';
    const flEmail = fl_email || fl.email || '';

    // 업무 협의사항 기본값
    const defaultTerms = [
      '1일 1영상 제작을 기본으로 하며, 1주일 기준 최소 7건 이상 작업',
      '정산은 매월 1일에 진행',
      '원천징수세 3.3% 공제 후 지정 계좌로 입금',
      '작업물은 CAPCUT 프로젝트 공유 또는 Google Drive 지정 경로에 업로드',
      '1일 1영상 필수이며, 초과 진행 희망 시 사전 협의 후 진행',
      '작업물 납품 후 수정 요청 시 1회 무상 수정, 이후 추가 비용 협의'
    ];
    const terms = work_terms && work_terms.length > 0 ? work_terms : defaultTerms;

    const defaultSpecialTerms = [
      '을은 업무 수행 중 알게 된 갑의 영업 비밀 및 기밀 정보를 제3자에게 누설하지 않는다.',
      '을이 제작한 작업물의 저작권은 납품 완료 시점부터 갑에게 귀속된다.',
      '계약 기간 중 해지를 원할 경우 최소 14일 전 서면 통보하여야 한다.',
      '갑과 을은 본 계약에 명시되지 않은 사항에 대해 상호 협의하여 결정한다.'
    ];
    const specials = special_terms && special_terms.length > 0 ? special_terms : defaultSpecialTerms;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>업무위탁계약서 - ${fl.name}</title>
<style>
  @page { size: A4; margin: 15mm 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 13px; color: #222; line-height: 1.7; padding: 30px 40px; max-width: 210mm; margin: 0 auto; }
  h1 { text-align: center; font-size: 24px; letter-spacing: 12px; margin: 20px 0 30px; padding-bottom: 15px; border-bottom: 2px solid #333; }
  .section-title { font-size: 14px; font-weight: 700; margin: 22px 0 10px; padding-left: 10px; border-left: 3px solid #302b63; }
  .contract-intro { font-size: 13px; line-height: 1.8; margin-bottom: 20px; text-indent: 10px; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  .info-table th, .info-table td { border: 1px solid #bbb; padding: 7px 12px; font-size: 12.5px; }
  .info-table th { background: #f5f5f5; width: 22%; text-align: center; font-weight: 600; }
  .info-table td { width: 28%; }
  .terms-list { padding-left: 20px; margin: 8px 0 16px; }
  .terms-list li { margin-bottom: 5px; font-size: 12.5px; line-height: 1.7; }
  .article { margin-bottom: 14px; }
  .article-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .article-body { padding-left: 14px; font-size: 12.5px; }
  .sign-section { margin-top: 40px; text-align: center; font-size: 15px; font-weight: 600; margin-bottom: 30px; }
  .sign-table { width: 100%; margin-top: 20px; }
  .sign-table td { padding: 6px 0; font-size: 13px; vertical-align: top; }
  .sign-label { width: 50px; font-weight: 700; font-size: 15px; vertical-align: top; padding-top: 6px; }
  .sign-content { padding-left: 12px; }
  .sign-content p { margin-bottom: 3px; }
  .sign-line { display: inline-block; min-width: 120px; border-bottom: 1px solid #333; margin-left: 8px; text-align: center; }
  .seal { display: inline-block; width: 40px; height: 40px; border: 2px solid #c0392b; border-radius: 50%; text-align: center; line-height: 36px; font-size: 11px; color: #c0392b; font-weight: 700; margin-left: 8px; vertical-align: middle; }
  .footer-note { text-align: center; margin-top: 24px; font-size: 11px; color: #999; }
  .no-print { text-align: center; margin-bottom: 20px; }
  @media print { .no-print { display: none; } body { padding: 0; } }
</style></head><body>

<div class="no-print">
  <button onclick="window.print()" style="padding:14px 40px;background:#302b63;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;margin-right:10px;">🖨️ 인쇄 / PDF 저장</button>
  <button onclick="window.close()" style="padding:14px 40px;background:#888;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">닫기</button>
</div>

<h1>업 무 위 탁 계 약 서</h1>

<p class="contract-intro">
  ${company_ceo || '위탁자'}(이하 "갑")과(와) ${flName}(이하 "을")은(는) 아래와 같이 업무위탁에 관한 계약을 체결한다.
</p>

<div class="section-title">당사자 정보</div>
<table class="info-table">
  <tr><th colspan="4" style="background:#e8e6f0;text-align:center;font-size:13px;">위탁자 (갑)</th></tr>
  <tr><th>대표자</th><td>${company_ceo || ''}</td><th>연락처</th><td>${company_phone || ''}</td></tr>
</table>
<table class="info-table">
  <tr><th colspan="4" style="background:#e6f0e8;text-align:center;font-size:13px;">수탁자 (을)</th></tr>
  <tr><th>성명</th><td>${flName}</td><th>생년월일</th><td>${fl_birthdate || ''}</td></tr>
  <tr><th>연락처</th><td>${flPhone}</td><th>이메일</th><td>${flEmail}</td></tr>
  <tr><th>입금 은행</th><td>${fl_bank || ''}</td><th>계좌번호</th><td>${fl_account || ''}</td></tr>
</table>

<div class="section-title">계약 내용</div>

<div class="article">
  <div class="article-title">제1조 (계약의 목적)</div>
  <div class="article-body">본 계약은 갑이 을에게 영상 편집 업무를 위탁하고, 을이 이를 성실히 수행함에 있어 필요한 사항을 정함을 목적으로 한다.</div>
</div>

<div class="article">
  <div class="article-title">제2조 (계약 기간)</div>
  <div class="article-body">
    계약일자: ${contract_date || today}<br>
    업무시작일: ${work_start_date || today}<br>
    계약종료일: ${contract_end_date || ''}<br>
    단, 계약 기간 만료 전 쌍방 이의가 없을 경우 동일 조건으로 자동 연장될 수 있다.
  </div>
</div>

<div class="article">
  <div class="article-title">제3조 (업무 내용 및 협의사항)</div>
  <div class="article-body">
    을은 다음 사항에 따라 업무를 수행한다:
    <ol class="terms-list">
      ${terms.map(t => `<li>${t}</li>`).join('')}
    </ol>
  </div>
</div>

<div class="article">
  <div class="article-title">제4조 (위탁 보수)</div>
  <div class="article-body">
    1. 건당 단가: <strong>${Number(unitPrice).toLocaleString()}원</strong> (부가세 별도)<br>
    2. 정산 기준: 매월 작업 완료 건수 × 건당 단가<br>
    3. 원천징수세(3.3%) 공제 후 을이 지정한 계좌로 매월 1일 입금<br>
    4. 작업 건수 산정 기준: Google Drive에 업로드된 영상 파일 기준
  </div>
</div>

<div class="article">
  <div class="article-title">제5조 (작업물 납품)</div>
  <div class="article-body">
    1. 을은 작업물을 갑이 지정한 Google Drive 경로 또는 CAPCUT 프로젝트 공유를 통해 납품한다.<br>
    2. 납품 파일은 영상 파일(.mp4, .mov, .avi 등)로 한정한다.<br>
    3. 파일명은 갑이 별도 지정한 규칙에 따른다.
  </div>
</div>

<div class="article">
  <div class="article-title">제6조 (특약사항)</div>
  <div class="article-body">
    <ol class="terms-list">
      ${specials.map(s => `<li>${s}</li>`).join('')}
    </ol>
  </div>
</div>

<div class="article">
  <div class="article-title">제7조 (계약 해지)</div>
  <div class="article-body">
    1. 갑 또는 을은 14일 전 서면 통보로 계약을 해지할 수 있다.<br>
    2. 을의 귀책 사유로 인한 해지 시, 갑은 미지급 보수를 정산 후 지급한다.<br>
    3. 을이 업무 태만, 무단 이탈 등 본 계약을 위반할 경우 갑은 즉시 계약을 해지할 수 있다.
  </div>
</div>

<div class="sign-section">
  위 계약을 증명하기 위하여 본 계약서 2부를 작성하고,<br>
  갑과 을이 각각 서명·날인 후 1부씩 보관한다.
</div>

<div style="text-align:center;font-size:15px;font-weight:700;margin-bottom:24px;">
  ${contract_date || today}
</div>

<table class="sign-table">
  <tr>
    <td class="sign-label">갑</td>
    <td class="sign-content">
      <p>대표자: ${company_ceo || ''}</p>
      <p>연락처: ${company_phone || ''}</p>
      <p style="margin-top:10px;">서명: <span class="sign-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <span class="seal">(인)</span></p>
    </td>
  </tr>
  <tr><td colspan="2" style="height:16px;"></td></tr>
  <tr>
    <td class="sign-label">을</td>
    <td class="sign-content">
      <p>성명: ${flName}</p>
      <p>연락처: ${flPhone}</p>
      <p style="margin-top:10px;">서명: <span class="sign-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <span class="seal">(인)</span></p>
    </td>
  </tr>
</table>

<div class="footer-note">본 계약서는 프리랜서 관리 시스템에서 생성되었습니다.</div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // ============ 갑(위탁자) 정보 저장/조회 ============
  app.get('/api/settings/company-info', requireAdmin, (req, res) => {
    const row = getSql("SELECT value FROM settings WHERE key='company_info'");
    res.json(row ? JSON.parse(row.value) : {});
  });

  app.post('/api/settings/company-info', requireAdmin, (req, res) => {
    const info = JSON.stringify(req.body);
    const existing = getSql("SELECT key FROM settings WHERE key='company_info'");
    if (existing) {
      runSql("UPDATE settings SET value=? WHERE key='company_info'", [info]);
    } else {
      runSql("INSERT INTO settings (key, value) VALUES ('company_info', ?)", [info]);
    }
    res.json({ success: true });
  });

  // ============ 계약서 이력 저장/조회/재출력 API ============
  app.post('/api/contract-documents', requireAdmin, (req, res) => {
    const { freelancer_id, form_data } = req.body;
    const result = runSql('INSERT INTO contract_documents (freelancer_id, form_data) VALUES (?,?)',
      [parseInt(freelancer_id), JSON.stringify(form_data)]);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.get('/api/contract-documents', requireAdmin, (req, res) => {
    const { freelancer_id } = req.query;
    let docs;
    if (freelancer_id) {
      docs = allSql('SELECT cd.*, f.name as freelancer_name FROM contract_documents cd JOIN freelancers f ON cd.freelancer_id = f.id WHERE cd.freelancer_id = ? ORDER BY cd.created_at DESC', [parseInt(freelancer_id)]);
    } else {
      docs = allSql('SELECT cd.*, f.name as freelancer_name FROM contract_documents cd JOIN freelancers f ON cd.freelancer_id = f.id ORDER BY cd.created_at DESC LIMIT 100');
    }
    docs = docs.map(d => ({ ...d, form_data: JSON.parse(d.form_data) }));
    res.json(docs);
  });

  app.delete('/api/contract-documents/:id', requireAdmin, (req, res) => {
    runSql('DELETE FROM contract_documents WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  });

  // ============ 길드 카드 거래 API ============

  function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다' });
    next();
  }

  // 스티커북 목록 (내 보유 통계 포함)
  app.get('/api/guild/books', requireLogin, (req, res) => {
    const userId = req.session.userId;
    const books = allSql(`
      SELECT b.*,
        (SELECT COUNT(*) FROM guild_cards WHERE book_id = b.id) as total_cards,
        (SELECT COUNT(*) FROM guild_cards c
         LEFT JOIN user_card_quantity uq ON uq.card_id = c.id AND uq.user_id = ?
         WHERE c.book_id = b.id AND COALESCE(uq.quantity,0) > 0) as owned_cards,
        (SELECT COALESCE(SUM(CASE WHEN uq.quantity > 1 THEN uq.quantity-1 ELSE 0 END),0)
         FROM guild_cards c LEFT JOIN user_card_quantity uq ON uq.card_id = c.id AND uq.user_id = ?
         WHERE c.book_id = b.id) as tradeable_total
      FROM guild_sticker_books b ORDER BY b.sort_order, b.id
    `, [userId, userId]);
    res.json(books);
  });

  // 스티커북 추가 (관리자)
  app.post('/api/guild/books', requireAdmin, (req, res) => {
    const { name, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '이름을 입력하세요' });
    const r = runSql('INSERT INTO guild_sticker_books (name, sort_order) VALUES (?,?)', [name.trim(), parseInt(sort_order)||0]);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  // 스티커북 수정 (관리자)
  app.put('/api/guild/books/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { name, sort_order, cover_image_path } = req.body;
    runSql('UPDATE guild_sticker_books SET name=?, sort_order=?, cover_image_path=? WHERE id=?',
      [name?.trim()||'', parseInt(sort_order)||0, cover_image_path||'', id]);
    res.json({ success: true });
  });

  // 스티커북 삭제 (관리자)
  app.delete('/api/guild/books/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const cards = allSql('SELECT id FROM guild_cards WHERE book_id=?', [id]);
    for (const c of cards) runSql('DELETE FROM user_card_quantity WHERE card_id=?', [c.id]);
    runSql('DELETE FROM guild_cards WHERE book_id=?', [id]);
    runSql('DELETE FROM guild_sticker_books WHERE id=?', [id]);
    res.json({ success: true });
  });

  // 특정 스티커북의 카드 목록 (내 수량 포함)
  app.get('/api/guild/books/:bookId/cards', requireLogin, (req, res) => {
    const bookId = parseInt(req.params.bookId);
    const userId = req.session.userId;
    const cards = allSql(`
      SELECT c.*, COALESCE(uq.quantity, 0) as my_quantity
      FROM guild_cards c
      LEFT JOIN user_card_quantity uq ON uq.card_id = c.id AND uq.user_id = ?
      WHERE c.book_id = ?
      ORDER BY c.position
    `, [userId, bookId]);
    res.json(cards);
  });

  // 카드 추가 (관리자)
  app.post('/api/guild/cards', requireAdmin, (req, res) => {
    const { book_id, name, position, rarity, image_path } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '카드 이름을 입력하세요' });
    if (!book_id) return res.status(400).json({ error: '스티커북을 선택하세요' });
    const r = runSql('INSERT INTO guild_cards (book_id, name, position, rarity, image_path) VALUES (?,?,?,?,?)',
      [parseInt(book_id), name.trim(), parseInt(position)||1, parseInt(rarity)||1, image_path||'']);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  // 카드 일괄 등록 (관리자 - 9개 이름을 한번에)
  app.post('/api/guild/books/:bookId/cards/bulk', requireAdmin, (req, res) => {
    const bookId = parseInt(req.params.bookId);
    const { names, rarity = 1 } = req.body; // names: array of 9 strings
    if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: '카드 이름 목록을 입력하세요' });
    runSql('DELETE FROM user_card_quantity WHERE card_id IN (SELECT id FROM guild_cards WHERE book_id=?)', [bookId]);
    runSql('DELETE FROM guild_cards WHERE book_id=?', [bookId]);
    const cards = [];
    names.forEach((name, i) => {
      if (name?.trim()) {
        const r = runSql('INSERT INTO guild_cards (book_id, name, position, rarity) VALUES (?,?,?,?)',
          [bookId, name.trim(), i+1, parseInt(rarity)||1]);
        cards.push({ id: r.lastInsertRowid, name: name.trim(), position: i+1 });
      }
    });
    res.json({ success: true, cards });
  });

  // 카드 수정 (관리자)
  app.put('/api/guild/cards/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { name, position, rarity, image_path } = req.body;
    runSql('UPDATE guild_cards SET name=?, position=?, rarity=?, image_path=? WHERE id=?',
      [name?.trim()||'', parseInt(position)||1, parseInt(rarity)||1, image_path||'', id]);
    res.json({ success: true });
  });

  // 카드 삭제 (관리자)
  app.delete('/api/guild/cards/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    runSql('DELETE FROM user_card_quantity WHERE card_id=?', [id]);
    runSql('DELETE FROM guild_cards WHERE id=?', [id]);
    res.json({ success: true });
  });

  // 카드 수량 조정 (+1 / -1) — 실시간 저장
  app.post('/api/guild/cards/:id/quantity', requireLogin, (req, res) => {
    const cardId = parseInt(req.params.id);
    const userId = req.session.userId;
    const delta = req.body.delta === 1 ? 1 : -1;
    const card = getSql('SELECT id FROM guild_cards WHERE id=?', [cardId]);
    if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다' });
    const cur = getSql('SELECT quantity FROM user_card_quantity WHERE user_id=? AND card_id=?', [userId, cardId]);
    const newQty = Math.max(0, (cur ? cur.quantity : 0) + delta);
    if (cur) {
      runSql('UPDATE user_card_quantity SET quantity=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=?', [newQty, userId, cardId]);
    } else {
      runSql('INSERT INTO user_card_quantity (user_id, card_id, quantity) VALUES (?,?,?)', [userId, cardId, newQty]);
    }
    res.json({ success: true, quantity: newQty });
  });

  // 길드원 목록 (통계 포함)
  app.get('/api/guild/members', requireLogin, (req, res) => {
    const myUserId = req.session.userId;
    const members = allSql(`
      SELECT u.id, u.display_name,
        (SELECT COUNT(DISTINCT uq.card_id) FROM user_card_quantity uq WHERE uq.user_id=u.id AND uq.quantity>0) as owned_count,
        (SELECT COALESCE(SUM(CASE WHEN uq.quantity>1 THEN uq.quantity-1 ELSE 0 END),0)
         FROM user_card_quantity uq WHERE uq.user_id=u.id) as tradeable_count
      FROM users u WHERE u.id != ? ORDER BY u.display_name
    `, [myUserId]);
    res.json(members);
  });

  // 특정 길드원과 카드 비교
  // A(나)가 줄 수 있는 카드: 내 qty>1 AND 상대방 qty=0 (상대방이 없는 카드)
  // A(나)가 받을 수 있는 카드: 상대방 qty>1 AND 내 qty=0 (내가 없는 카드)
  app.get('/api/guild/compare/:userId', requireLogin, (req, res) => {
    const myUserId = req.session.userId;
    const targetUserId = parseInt(req.params.userId);
    const targetUser = getSql('SELECT id, display_name FROM users WHERE id=?', [targetUserId]);
    if (!targetUser) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });

    const canGive = allSql(`
      SELECT gc.id, gc.name, gc.rarity, gc.image_path, gsb.name as book_name,
        (my.quantity - 1) as tradeable_qty
      FROM guild_cards gc
      JOIN guild_sticker_books gsb ON gsb.id = gc.book_id
      JOIN user_card_quantity my ON my.card_id=gc.id AND my.user_id=? AND my.quantity>1
      LEFT JOIN user_card_quantity their ON their.card_id=gc.id AND their.user_id=?
      WHERE COALESCE(their.quantity,0) = 0
      ORDER BY gsb.sort_order, gc.position
    `, [myUserId, targetUserId]);

    const canReceive = allSql(`
      SELECT gc.id, gc.name, gc.rarity, gc.image_path, gsb.name as book_name,
        (their.quantity - 1) as tradeable_qty
      FROM guild_cards gc
      JOIN guild_sticker_books gsb ON gsb.id = gc.book_id
      JOIN user_card_quantity their ON their.card_id=gc.id AND their.user_id=? AND their.quantity>1
      LEFT JOIN user_card_quantity my ON my.card_id=gc.id AND my.user_id=?
      WHERE COALESCE(my.quantity,0) = 0
      ORDER BY gsb.sort_order, gc.position
    `, [targetUserId, myUserId]);

    res.json({ targetUser, canGive, canReceive });
  });

  // ============ 공개 길드 카드 현황 (로그인 불필요) ============

  // 전체 요약: 스티커북별 모든 유저 보유 현황
  app.get('/api/guild/public/summary', (req, res) => {
    const books = allSql('SELECT * FROM guild_sticker_books ORDER BY sort_order, id');
    const members = allSql(`
      SELECT u.id, u.display_name,
        (SELECT COUNT(DISTINCT uq.card_id) FROM user_card_quantity uq WHERE uq.user_id=u.id AND uq.quantity>0) as owned_count,
        (SELECT COALESCE(SUM(CASE WHEN uq.quantity>1 THEN uq.quantity-1 ELSE 0 END),0)
         FROM user_card_quantity uq WHERE uq.user_id=u.id) as tradeable_count
      FROM users u ORDER BY u.display_name
    `);
    const totalCards = getSql('SELECT COUNT(*) as cnt FROM guild_cards')?.cnt || 0;

    // 스티커북별 각 멤버 보유 수
    const detail = books.map(b => {
      const bookCards = getSql('SELECT COUNT(*) as cnt FROM guild_cards WHERE book_id=?', [b.id])?.cnt || 0;
      const memberProgress = members.map(m => {
        const owned = getSql(`SELECT COUNT(*) as cnt FROM guild_cards c
          LEFT JOIN user_card_quantity uq ON uq.card_id=c.id AND uq.user_id=?
          WHERE c.book_id=? AND COALESCE(uq.quantity,0)>0`, [m.id, b.id])?.cnt || 0;
        const tradeable = getSql(`SELECT COALESCE(SUM(CASE WHEN uq.quantity>1 THEN uq.quantity-1 ELSE 0 END),0) as t
          FROM guild_cards c LEFT JOIN user_card_quantity uq ON uq.card_id=c.id AND uq.user_id=?
          WHERE c.book_id=?`, [m.id, b.id])?.t || 0;
        return { userId: m.id, owned, tradeable };
      });
      return { ...b, total: bookCards, memberProgress };
    });
    res.json({ books: detail, members, totalCards, updatedAt: new Date().toISOString() });
  });

  // 특정 멤버의 전체 카드 현황
  app.get('/api/guild/public/member/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = getSql('SELECT id, display_name FROM users WHERE id=?', [userId]);
    if (!user) return res.status(404).json({ error: '없는 유저입니다' });
    const books = allSql('SELECT * FROM guild_sticker_books ORDER BY sort_order, id');
    const result = books.map(b => {
      const cards = allSql(`
        SELECT c.id, c.name, c.position, c.rarity, c.image_path,
          COALESCE(uq.quantity,0) as quantity
        FROM guild_cards c
        LEFT JOIN user_card_quantity uq ON uq.card_id=c.id AND uq.user_id=?
        WHERE c.book_id=? ORDER BY c.position
      `, [userId, b.id]);
      return { ...b, cards };
    });
    res.json({ user, books: result });
  });

  // 공개 페이지 서빙
  app.get('/guild', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'guild.html'));
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });

  // ============ 서버 시작 ============
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n========================================`);
    console.log(`  프리랜서 관리 시스템 시작!`);
    console.log(`  로컬: http://localhost:${PORT}`);
    console.log(`  관리자 ID: admin`);
    console.log(`  관리자 PW: ${process.env.ADMIN_PASSWORD || 'admin1234'}`);
    console.log(`========================================\n`);

    await initDriveService();
    if (driveService) startAutoSync();
  });
}

main().catch(err => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
