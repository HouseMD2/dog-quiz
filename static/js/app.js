const el = (id) => document.getElementById(id);
const $welcome = el('welcome');
const $quiz = el('quiz');
const $learning = el('learning');
const $result = el('result');
const $scoreline = el('scoreline');
const $message = el('message');
const $certificate = el('certificate');
const $certStatus = el('certStatus');
const $aidModal = el('aid-modal');
const $aidText = el('aid-text');

let state = {
  mode: 'quiz', // or 'learn'
  name: '',
  level: 'U10',
  questions: [],
  index: 0,
  score: 0,
  usedAid1: new Set(),
  usedAid2: new Set()
};

async function start(mode) {
  state.mode = mode;
  state.name = el('name').value.trim() || 'Dog Fan';
  state.level = el('level').value;
  state.index = 0;
  state.score = 0;
  state.usedAid1.clear?.();
  state.usedAid2.clear?.();

  const res = await fetch(`/api/questions?mode=${encodeURIComponent(mode)}&level=${encodeURIComponent(state.level)}`);
  state.questions = await res.json();

  $welcome.classList.add('hidden');
  if (mode === 'learn') {
    showLesson();
  } else {
    $learning.classList.add('hidden');
    $quiz.classList.remove('hidden');
    renderQuestion();
  }
}

function showLesson() {
  const q = state.questions[state.index];
  $learning.classList.remove('hidden');
  $quiz.classList.add('hidden');
  el('lesson').innerHTML = `
    <div class="card">
      <h3>Learn: ${q.question}</h3>
      ${q.lessonImage ? `<img class="q-image" src="${q.lessonImage}" alt="lesson"/>` : ''}
      <p>${q.lesson || ''}</p>
    </div>`;
}

el('continue-to-question').onclick = () => {
  $learning.classList.add('hidden');
  $quiz.classList.remove('hidden');
  renderQuestion();
};

function renderQuestion() {
  const q = state.questions[state.index];
  if (!q) return finish();

  const progress = `${state.index + 1} / ${state.questions.length}`;
  $quiz.innerHTML = `
    <div class="card">
      <div class="meta">
        <strong>${progress}</strong>
        <span>•</span>
        <span>Level: ${state.level}</span>
        <span>•</span>
        <span>Score: ${state.score}</span>
      </div>
      <h3>${q.question}</h3>
      ${q.image ? `<img class="q-image" src="${q.image}" alt="question image"/>` : ''}
      <div class="options">
        ${q.options.map((opt, i) => `<div class="option" data-idx="${i}">${opt}</div>`).join('')}
      </div>
      <div class="row">
        <button class="aid" id="aid1">Hint 1</button>
        <button class="aid" id="aid2">Hint 2</button>
      </div>
    </div>
  `;

  // Wire answers
  [...$quiz.querySelectorAll('.option')].forEach(opt => {
    opt.onclick = () => selectAnswer(parseInt(opt.dataset.idx, 10));
  });
  el('aid1').onclick = () => showAid(q, 1);
  el('aid2').onclick = () => showAid(q, 2);
}

function showAid(q, level) {
  $aidText.textContent = level === 1 ? (q.aid1 || 'No hint.') : (q.aid2 || 'No hint.');
  $aidModal.classList.remove('hidden');
  // track usage
  const key = `${q.id}`;
  if (level === 1) state.usedAid1.add(key);
  if (level === 2) state.usedAid2.add(key);
}
el('aid-close').onclick = () => $aidModal.classList.add('hidden');

function selectAnswer(idx) {
  const q = state.questions[state.index];
  const cards = [...$quiz.querySelectorAll('.option')];
  const correct = q.answerIndex === idx;

  cards.forEach((c, i) => {
    c.classList.add(i === q.answerIndex ? 'correct' : (i === idx ? 'wrong' : ''));
    c.style.pointerEvents = 'none';
  });

  // Scoring: 4 (no hint), 2 (aid1 used), 1 (aid2 used), 0 wrong
  let add = 0;
  if (correct) {
    const key = `${q.id}`;
    if (state.usedAid2.has(key)) add = 1;
    else if (state.usedAid1.has(key)) add = 2;
    else add = 4;
  }
  state.score += add;

  setTimeout(() => {
    // Reset hint usage for this question
    const key = `${q.id}`;
    state.usedAid1.delete(key);
    state.usedAid2.delete(key);

    state.index++;
    if (state.mode === 'learn' && state.index < state.questions.length) {
      showLesson();
    } else {
      renderQuestion();
    }
  }, 700);
}

function finish() {
  $quiz.classList.add('hidden');
  $learning.classList.add('hidden');
  $result.classList.remove('hidden');

  const max = state.questions.length * 4;     // 80 points
  const percent = Math.round((state.score / max) * 100);
  const passed = percent >= 75;

  $scoreline.textContent = `${state.name}, you scored ${state.score}/${max} (${percent}%).`;
  $message.textContent = passed
    ? "Fantastic job! You passed — you're a true dog expert! 🐾"
    : "Great effort! Keep learning and you’ll ace it next time. 🐶";

  $certificate.classList.remove('hidden');
}

el('sendCert').onclick = async () => {
  $certStatus.textContent = "Generating & sending certificate…";
  const email = el('certEmail').value.trim();
  const resp = await fetch('/api/certificate', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      name: state.name,
      level: state.level,
      mode: state.mode,
      score: state.score,
      total: state.questions.length * 4,
      email
    })
  });
  const json = await resp.json();
  $certStatus.textContent = json.ok
    ? "Certificate sent! (check your inbox / spam)"
    : `Could not email certificate: ${json.error || 'Unknown error'}`;
};

el('restart').onclick = () => {
  $result.classList.add('hidden');
  $welcome.classList.remove('hidden');
};

el('start-quiz').onclick = () => start('quiz');
el('start-learn').onclick = () => start('learn');
