/* ================================================
   대평고 가이드북 - 사이트 동작 스크립트
   ================================================ */

// ----- 입학년도 결정 -----
const params = new URLSearchParams(location.search);
const YEAR = params.get('year') === '2025' ? '2025' : '2026';

// ----- 구글 시트 연동 설정 (나중에 입력) -----
// 구글 시트를 "웹에 게시" → CSV 형식으로 게시한 URL을 여기에 붙여넣으면
// 사이트가 자동으로 시트의 과목 설명을 읽어옵니다.
const SHEET_CSV_URL = ''; // 예: 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv'

// ----- 전역 데이터 -----
let curriculumData = null;
let subjectInfoMap = {}; // key: "year::과목명" -> 시트 정보

// ----- 시작 -----
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 상단바 입학년도 표시
  const topYear = document.getElementById('topbarYear');
  if (topYear) topYear.querySelector('.year-badge').textContent = `${YEAR}학년도 입학생`;

  // 데이터 로드
  try {
    const res = await fetch('curriculum.json');
    const all = await res.json();
    curriculumData = all[YEAR];
  } catch (err) {
    console.error('curriculum.json 로드 실패:', err);
    return;
  }

  // 시트에서 과목 정보 가져오기 (있을 때만)
  if (SHEET_CSV_URL) {
    try {
      await loadSubjectInfo();
    } catch (err) {
      console.warn('시트 정보 로드 실패 (무시하고 진행):', err);
    }
  }

  renderRequirements();
  setupGradeTabs();
  renderGrade(1);
  setupModal();
}

// ----- 교과군별 필수 학점 -----
function renderRequirements() {
  const grid = document.getElementById('reqGrid');
  if (!grid) return;

  grid.innerHTML = curriculumData.requirements.map(r => `
    <div class="req-card">
      <span class="req-card-label">필수 이수</span>
      <span class="req-card-area">${escapeHtml(r.area)}</span>
      <span class="req-card-credit">
        <span class="req-card-num">${r.required}</span>
        <span class="req-card-unit">학점</span>
      </span>
    </div>
  `).join('');
}

// ----- 학년 탭 -----
function setupGradeTabs() {
  document.querySelectorAll('.grade-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.grade-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderGrade(parseInt(tab.dataset.grade));
    });
  });
}

// ----- 학년별 과목 렌더링 -----
function renderGrade(grade) {
  const container = document.getElementById('gradeContent');
  if (!container) return;

  // 1) 학교지정 과목들을 교과군별로 묶기
  const fixedByArea = {};
  curriculumData.fixedSubjects.forEach(s => {
    const inThisGrade = s.semesters.some(sem => sem.grade === grade);
    if (!inThisGrade) return;
    if (!fixedByArea[s.area]) fixedByArea[s.area] = [];
    fixedByArea[s.area].push(s);
  });

  // 2) 해당 학년의 선택군
  const electives = curriculumData.electiveGroups.filter(g => g.grade === grade);

  let html = '';

  // 학교지정 과목
  Object.entries(fixedByArea).forEach(([area, subjects]) => {
    const totalCredits = subjects.reduce((sum, s) => {
      const sem = s.semesters.find(x => x.grade === grade);
      return sum + (sem ? sem.credits : 0);
    }, 0);

    html += `
      <div class="area-block">
        <div class="area-header">
          <div>
            <span class="area-tag">학교지정</span>
            <h3 class="area-name" style="margin-top:6px">${escapeHtml(area)}</h3>
          </div>
          <span class="area-sub">${grade}학년 · ${totalCredits}학점</span>
        </div>
        <div class="subject-grid">
          ${subjects.map(s => subjectCardHtml(s, grade, false)).join('')}
        </div>
      </div>
    `;
  });

  // 선택군 (2·3학년)
  electives.forEach(group => {
    const semText = group.semesters.map(s => `${s.semester}학기`).join(', ');
    html += `
      <div class="elective-block">
        <div class="area-header">
          <div>
            <span class="elective-pick">택 ${group.selectCount}</span>
            <h3 class="area-name" style="margin-top:6px">${escapeHtml(group.area)}</h3>
          </div>
          <span class="area-sub">${semText} · 과목당 ${group.creditsPerSubject || 3}학점</span>
        </div>
        <div class="subject-grid">
          ${group.subjects.map(name => electiveCardHtml(name, group, grade)).join('')}
        </div>
      </div>
    `;
  });

  if (!html) {
    html = '<p style="color: var(--ink-500); text-align: center; padding: 40px;">해당 학년 과목 정보가 없습니다.</p>';
  }

  container.innerHTML = html;

  // 카드 클릭 이벤트
  container.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset));
  });
}

function subjectCardHtml(subject, grade, isElective) {
  const sem = subject.semesters.find(s => s.grade === grade);
  const semLabel = sem ? `${sem.semester}학기` : '';
  const credits = sem ? sem.credits : subject.baseCredit;
  const types = subject.types.join(', ');

  return `
    <button class="subject-card${isElective ? ' subject-card-elective' : ''}"
            data-name="${escapeAttr(subject.name)}"
            data-area="${escapeAttr(subject.area)}"
            data-credits="${credits}"
            data-types="${escapeAttr(types)}"
            data-semester="${grade}학년 ${semLabel}"
            data-category="학교지정">
      <span class="subject-card-name">${escapeHtml(subject.name)}</span>
      <div class="subject-card-meta">
        <span class="subject-card-credit">${credits}학점</span>
        <span class="subject-card-type">${escapeHtml(types)}</span>
      </div>
      <span class="subject-card-semester">${semLabel}</span>
    </button>
  `;
}

function electiveCardHtml(name, group, grade) {
  const semText = group.semesters.map(s => `${s.semester}학기`).join(', ');
  // 개별 과목 유형이 지정돼 있으면 그것을, 없으면 그룹의 모든 유형을 표시
  const subjectTypes = curriculumData.subjectTypes || {};
  const customType = subjectTypes[name];
  const types = customType ? customType : group.types.join(' / ');
  return `
    <button class="subject-card subject-card-elective"
            data-name="${escapeAttr(name)}"
            data-area="${escapeAttr(group.area)}"
            data-credits="${group.creditsPerSubject || 3}"
            data-types="${escapeAttr(types)}"
            data-semester="${grade}학년 ${semText}"
            data-category="${grade}학년 선택 (택${group.selectCount})">
      <span class="subject-card-name">${escapeHtml(name)}</span>
      <div class="subject-card-meta">
        <span class="subject-card-credit">${group.creditsPerSubject || 3}학점</span>
        <span class="subject-card-type">${escapeHtml(types)}</span>
      </div>
      <span class="subject-card-semester">${semText}</span>
    </button>
  `;
}

// ----- 모달 -----
function setupModal() {
  const overlay = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');
  if (!overlay) return;

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
  });
}

function openModal(data) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const areaEl = document.getElementById('modalArea');
  const metaEl = document.getElementById('modalMeta');
  const bodyEl = document.getElementById('modalBody');

  titleEl.textContent = data.name;
  areaEl.textContent = data.area;
  metaEl.innerHTML = `
    <span class="modal-meta-tag tag-credit">${data.credits}학점</span>
    <span class="modal-meta-tag tag-type">${escapeHtml(data.types)}</span>
    <span class="modal-meta-tag tag-semester">${data.semester}</span>
  `;

  // 1) 시트에서 가져온 정보 (구글 시트 연동 시)
  const sheetKey = `${YEAR}::${data.name}`;
  const sheetInfo = subjectInfoMap[sheetKey];

  // 2) JSON에 저장된 정보 (관리자 페이지에서 입력)
  const jsonInfo = (curriculumData.subjectInfo || {})[data.name];

  // 3) 학교 공통 PDF 파일
  const pdfFile = curriculumData.pdfFile || '';

  let body = '';

  // 시트 정보 우선
  if (sheetInfo) {
    if (sheetInfo.intro) body += sectionHtml('한 줄 소개', sheetInfo.intro);
    if (sheetInfo.content) body += sectionHtml('학습 내용', sheetInfo.content);
    if (sheetInfo.eval) body += sectionHtml('평가 방식', sheetInfo.eval);
    if (sheetInfo.target) body += sectionHtml('추천 대상', sheetInfo.target);
    if (sheetInfo.teacher) {
      body += `<div class="modal-section"><div class="modal-section-content" style="font-size:13px; color: var(--ink-500);">담당: ${escapeHtml(sheetInfo.teacher)}</div></div>`;
    }
    if (sheetInfo.pdf) {
      body += `<a href="${escapeAttr(sheetInfo.pdf)}" target="_blank" rel="noopener" class="pdf-button">선택과목 안내서 보기</a>`;
    }
  }
  // 시트 정보 없으면 JSON 정보 사용
  else if (jsonInfo && (jsonInfo.intro || jsonInfo.page || jsonInfo.youtube)) {
    if (jsonInfo.intro) {
      body += sectionHtml('한 줄 소개', jsonInfo.intro);
    }

    // PDF 페이지 + 유튜브를 같이 묶어서 보여줌
    // 과목별로 지정된 PDF가 있으면 그걸 우선, 없으면 공통 PDF 사용
    const subjectPdf = jsonInfo.pdfFile || pdfFile;
    const buttons = [];
    if (jsonInfo.page && subjectPdf) {
      const pdfUrl = `${subjectPdf}#page=${jsonInfo.page}`;
      buttons.push(`<a href="${escapeAttr(pdfUrl)}" target="_blank" rel="noopener" class="pdf-button">선택과목 안내서 보기 (p.${jsonInfo.page})</a>`);
    } else if (jsonInfo.page && !subjectPdf) {
      body += `<div class="modal-section"><div class="modal-section-content" style="font-size:12px; color: var(--ink-500);">PDF 안내서 p.${jsonInfo.page}</div></div>`;
    }
    if (buttons.length) body += `<div class="modal-buttons">${buttons.join('')}</div>`;

    // 유튜브 임베드
    if (jsonInfo.youtube) {
      const ytId = parseYoutubeId(jsonInfo.youtube);
      if (ytId) {
        body += `
          <div class="modal-section">
            <div class="modal-section-label">안내 영상</div>
            <div class="yt-embed">
              <iframe src="https://www.youtube.com/embed/${ytId}"
                title="${escapeAttr(data.name)} 안내 영상"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>
            </div>
          </div>
        `;
      } else {
        // 유효 ID 추출 실패 시 외부 링크로 fallback
        body += `<a href="${escapeAttr(jsonInfo.youtube)}" target="_blank" rel="noopener" class="pdf-button" style="background: #c4302b;">🎬 유튜브 영상 보기</a>`;
      }
    }
  }

  if (!body) {
    bodyEl.innerHTML = emptyHtml();
  } else {
    bodyEl.innerHTML = body;
  }

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function sectionHtml(label, content) {
  return `
    <div class="modal-section">
      <div class="modal-section-label">${label}</div>
      <div class="modal-section-content">${escapeHtml(content)}</div>
    </div>
  `;
}

function emptyHtml() {
  return `
    <div class="modal-empty">
      <strong>아직 안내 자료가 준비 중입니다</strong>
      담당 선생님께서 상세 안내를 곧 등록해 주실 예정입니다.
    </div>
  `;
}

// ----- 구글 시트 CSV 로드 -----
async function loadSubjectInfo() {
  const res = await fetch(SHEET_CSV_URL);
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return;

  // 헤더 인덱스 매핑
  const header = rows[0];
  const idx = {
    year: header.indexOf('입학년도'),
    name: header.indexOf('과목명'),
    intro: header.indexOf('한 줄 소개'),
    content: header.indexOf('학습 내용'),
    eval: header.indexOf('평가 방식'),
    target: header.indexOf('추천 대상'),
    pdf: header.indexOf('PDF 안내서 링크'),
    teacher: header.indexOf('담당 교사')
  };

  rows.slice(1).forEach(row => {
    const year = row[idx.year];
    const name = row[idx.name];
    if (!year || !name) return;
    const key = `${year}::${name.trim()}`;
    subjectInfoMap[key] = {
      intro: row[idx.intro] || '',
      content: row[idx.content] || '',
      eval: row[idx.eval] || '',
      target: row[idx.target] || '',
      pdf: row[idx.pdf] || '',
      teacher: row[idx.teacher] || ''
    };
  });
}

// ----- 간단한 CSV 파서 (따옴표 포함된 셀 지원) -----
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuote) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') {} // 무시
      else cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ----- 유튜브 URL → 영상 ID 추출 -----
function parseYoutubeId(url) {
  if (!url) return '';
  url = String(url).trim();
  // 1) youtu.be/VIDEOID
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // 2) youtube.com/watch?v=VIDEOID
  m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // 3) youtube.com/embed/VIDEOID
  m = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // 4) youtube.com/shorts/VIDEOID
  m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // 5) 그냥 ID만 입력한 경우
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  return '';
}

// ----- 안전 처리 -----
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
