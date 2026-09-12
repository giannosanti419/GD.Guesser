```javascript
// ============================================================
// GDLE — Geometry Dash Guessing Game
// ============================================================

const GDBROWSER = 'https://gdbrowser.com/api';
const POINTERCRATE = 'https://pointercrate.com/api/v2/demons/listed/';

const fallbackLevels = [
    { id: '128', name: '1st level', author: 'real storm' },
    { id: '10565798', name: 'Bloodbath', author: 'Riot' },
    { id: '4284013', name: 'Nine Circles', author: 'Zobros' },
    { id: '11261085', name: 'Slaughterhouse', author: 'icedcave' }
];

let currentMode = 'name';
let currentTime = 15;
let currentLevel = null;
let timerId = null;
let endAt = 0;
let score = 0;
let roundDone = false;
let demonCache = [];


// ============================================================
// BASIC HELPERS
// ============================================================

const $ = id => document.getElementById(id);

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => {
        s.classList.remove('active');
    });

    const section = $(id);

    if (section) {
        section.classList.add('active');
    }

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}


// ============================================================
// NAVIGATION
// ============================================================

document.querySelectorAll('[data-section]').forEach(button => {
    button.onclick = () => {
        showSection(button.dataset.section);
    };
});

document.querySelectorAll('.mode-card').forEach(button => {
    button.onclick = () => {
        if (button.dataset.daily) {
            startDaily(currentMode);
            return;
        }

        currentMode = button.dataset.mode;
        prepareGame();
    };
});


// ============================================================
// TIME SETTINGS
// ============================================================

function setTime(value) {
    currentTime = value;

    $('timeValue').textContent = value;
    $('timeSlider').value = value;
}

document.querySelectorAll('.time-buttons button').forEach(button => {
    button.onclick = () => {
        setTime(Number(button.dataset.time));
    };
});

$('timeSlider').oninput = event => {
    setTime(Number(event.target.value));
};


// ============================================================
// BUTTONS / INPUTS
// ============================================================

$('startBtn').onclick = startGame;
$('submitBtn').onclick = submitAnswer;
$('nextBtn').onclick = startGame;

$('answer').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        submitAnswer();
    }
});

$('percent').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        submitAnswer();
    }
});

document.querySelectorAll('.daily-mode').forEach(button => {
    button.onclick = () => {
        currentMode = button.dataset.dailyMode;
        startDaily(currentMode);
    };
});


// ============================================================
// GAME SETUP
// ============================================================

function prepareGame() {
    showSection('play');

    $('setupPanel').classList.remove('hidden');
    $('gamePanel').classList.add('hidden');

    const titles = {
        name: [
            'Guess the Level',
            'Identify the level from its image.'
        ],

        namePercent: [
            'Level + Percentage',
            'Guess the level and the progress shown.'
        ],

        position: [
            'Extreme Position',
            'Guess the current Demon List position.'
        ]
    };

    $('setupTitle').textContent = titles[currentMode][0];

    $('setupDescription').textContent =
        titles[currentMode][1] +
        ' Choose your time limit.';
}


// ============================================================
// GDBROWSER API
// ============================================================

async function getLevel(id) {
    const response = await fetch(
        `${GDBROWSER}/level/${encodeURIComponent(id)}`
    );

    if (!response.ok) {
        throw new Error('GDBrowser level request failed');
    }

    return await response.json();
}


async function searchLevels(query) {
    const response = await fetch(
        `${GDBROWSER}/search/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
        throw new Error('GDBrowser search failed');
    }

    return await response.json();
}


// ============================================================
// RANDOM LEVEL
// ============================================================

async function getRandomLevel() {

    /*
     * Searching several common characters gives us a pool of
     * real levels instead of relying on a hardcoded list.
     */

    const queries = [
        'the',
        'a',
        'i',
        'gd',
        'level',
        'x',
        'y'
    ];

    try {
        const query =
            queries[Math.floor(Math.random() * queries.length)];

        const data = await searchLevels(query);

        const levels =
            Array.isArray(data)
                ? data
                : (
                    data?.levels ||
                    data?.data ||
                    []
                );

        if (levels.length > 0) {
            return levels[
                Math.floor(Math.random() * levels.length)
            ];
        }

    } catch (error) {
        console.warn('Random level search failed:', error);
    }

    return fallbackLevels[
        Math.floor(Math.random() * fallbackLevels.length)
    ];
}


// ============================================================
// TEXT / ANSWER CHECKING
// ============================================================

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}


function levenshtein(a, b) {
    a = normalize(a);
    b = normalize(b);

    const matrix = Array.from(
        { length: a.length + 1 },
        (_, i) => [i]
    );

    for (let j = 1; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {

        matrix[i] = [i];

        for (let j = 1; j <= b.length; j++) {

            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] +
                (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }

    return matrix[a.length][b.length];
}


function nameCorrect(input, answer) {

    const a = normalize(input);
    const b = normalize(answer);

    if (!a) {
        return false;
    }

    if (a === b) {
        return true;
    }

    if (
        a.length >= 5 &&
        (
            b.includes(a) ||
            a.includes(b)
        )
    ) {
        return true;
    }

    return (
        levenshtein(a, b) <=
        Math.max(
            1,
            Math.floor(b.length * 0.12)
        )
    );
}


// ============================================================
// LEVEL IMAGE
// ============================================================

/*
 * IMPORTANT:
 *
 * We do NOT use the old broken gd-level-api.liamt.xyz server.
 *
 * Instead, we try to obtain an actual image associated with the
 * level through GDBrowser / Geometry Dash resources.
 *
 * If no image can be loaded, the game displays the GDBrowser
 * level page inside a visual card rather than generating the old
 * "MYSTERY LEVEL" fake image.
 */


async function imageFor(level) {

    const id =
        level.id ||
        level.levelID ||
        level.levelId;

    if (!id) {
        throw new Error('Level has no ID');
    }

    /*
     * Known GDBrowser difficulty icons aren't level screenshots,
     * so we deliberately don't use them as fake level images.
     *
     * First attempt: GDBrowser's level image routes.
     */

    const candidates = [
        `https://gdbrowser.com/assets/levels/${id}.png`,
        `https://gdbrowser.com/assets/level/${id}.png`,
        `https://gdbrowser.com/level/${id}.png`,
        `https://gdbrowser.com/levels/${id}.png`
    ];

    for (const url of candidates) {

        const works = await testImage(url);

        if (works) {
            return url;
        }
    }

    /*
     * If GDBrowser doesn't expose a direct image for this level,
     * create a useful visual card using the REAL level metadata.
     *
     * This is NOT the old "MYSTERY LEVEL" fallback.
     */

    return makeLevelCard(level);
}


function testImage(url) {

    return new Promise(resolve => {

        const image = new Image();

        let finished = false;

        const finish = result => {

            if (finished) {
                return;
            }

            finished = true;
            resolve(result);
        };

        image.onload = () => {
            finish(
                image.naturalWidth > 100 &&
                image.naturalHeight > 100
            );
        };

        image.onerror = () => {
            finish(false);
        };

        image.src =
            url +
            (url.includes('?') ? '&' : '?') +
            'v=' +
            Date.now();
    });
}


function makeLevelCard(level) {

    const canvas = document.createElement('canvas');

    canvas.width = 1280;
    canvas.height = 720;

    const ctx = canvas.getContext('2d');

    let hash = 0;

    for (const character of String(
        level.id ||
        level.name ||
        'GDLE'
    )) {
        hash =
            (
                hash * 31 +
                character.charCodeAt(0)
            ) >>> 0;
    }

    const hue = hash % 360;

    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            1280,
            720
        );

    gradient.addColorStop(
        0,
        `hsl(${hue}, 70%, 20%)`
    );

    gradient.addColorStop(
        1,
        `hsl(${(hue + 80) % 360}, 70%, 8%)`
    );

    ctx.fillStyle = gradient;
    ctx.fillRect(
        0,
        0,
        1280,
        720
    );


    // Decorative Geometry Dash-style circles

    ctx.fillStyle =
        'rgba(255,255,255,0.08)';

    for (let i = 0; i < 18; i++) {

        ctx.beginPath();

        ctx.arc(
            (hash * (i + 3)) % 1280,
            (hash * 7 + i * 83) % 720,
            50 + i * 8,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    // Level name

    ctx.fillStyle = '#ffffff';

    ctx.font =
        '900 62px system-ui, sans-serif';

    const name =
        String(level.name || 'Unknown Level');

    ctx.fillText(
        name.substring(0, 28),
        70,
        110
    );


    // Creator

    ctx.font =
        '600 32px system-ui, sans-serif';

    ctx.fillStyle =
        'rgba(255,255,255,0.75)';

    ctx.fillText(
        'by ' +
        String(
            level.author ||
            level.creator ||
            'Unknown'
        ).substring(0, 35),
        70,
        160
    );


    // Level ID

    ctx.font =
        '500 25px system-ui, sans-serif';

    ctx.fillStyle =
        'rgba(255,255,255,0.55)';

    ctx.fillText(
        `Level ID: ${level.id || 'unknown'}`,
        70,
        205
    );


    // Difficulty

    if (level.difficulty) {

        ctx.fillText(
            String(level.difficulty),
            70,
            245
        );
    }


    // GDLE branding

    ctx.font =
        '800 24px system-ui, sans-serif';

    ctx.fillStyle =
        'rgba(255,255,255,0.45)';

    ctx.fillText(
        'GDLE',
        70,
        650
    );


    return canvas.toDataURL(
        'image/jpeg',
        0.9
    );
}


// ============================================================
// GAME START
// ============================================================

async function startGame() {

    clearInterval(timerId);

    roundDone = false;

    $('feedback').textContent = '';
    $('feedback').className = 'feedback';

    $('nextBtn').classList.add('hidden');

    $('submitBtn').disabled = false;

    $('answer').value = '';
    $('percent').value = '';

    $('setupPanel').classList.add('hidden');
    $('gamePanel').classList.remove('hidden');


    // Mode label

    $('modeLabel').textContent =
        currentMode === 'name'
            ? 'GUESS THE LEVEL'
            : currentMode === 'namePercent'
                ? 'LEVEL + PERCENTAGE'
                : 'EXTREME POSITION';


    // Question

    $('questionText').textContent =
        currentMode === 'position'
            ? "What is this level's current Demon List position?"
            : 'What level is this?';


    $('answer').classList.remove('hidden');

    $('percent').classList.toggle(
        'hidden',
        currentMode !== 'namePercent'
    );


    $('answer').placeholder =
        'Level name...';


    try {

        // ====================================================
        // EXTREME / DEMON LIST MODE
        // ====================================================

        if (currentMode === 'position') {

            currentLevel =
                await getRandomExtreme();

        } else {

            currentLevel =
                await getRandomLevel();

        }


        // ====================================================
        // GET FULL LEVEL DATA
        // ====================================================

        const id =
            currentLevel.id ||
            currentLevel.levelID ||
            currentLevel.levelId;


        try {

            const full =
                await getLevel(id);

            currentLevel = {
                ...currentLevel,
                ...full
            };

        } catch (error) {

            console.warn(
                'Could not get full level data:',
                error
            );
        }


        // ====================================================
        // IMAGE
        // ====================================================

        const image =
            await imageFor(currentLevel);

        $('levelImage').src = image;


        // Position question

        if (currentMode === 'position') {

            $('questionText').textContent =
                "What is this level's current Demon List position?";
        }


        startTimer();

    } catch (error) {

        console.error(error);

        $('feedback').textContent =
            'Could not load a level. Try again.';

        $('feedback').className =
            'feedback bad';
    }
}


// ============================================================
// POINTERCRATE / DEMON LIST
// ============================================================

async function getRandomExtreme() {

    if (!demonCache.length) {

        const response =
            await fetch(
                POINTERCRATE,
                {
                    headers: {
                        Accept: 'application/json'
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                'Pointercrate request failed'
            );
        }

        const data =
            await response.json();

        demonCache =
            Array.isArray(data)
                ? data
                : (
                    data?.data ||
                    []
                );
    }


    if (!demonCache.length) {
        throw new Error(
            'No demons returned by Pointercrate'
        );
    }


    const demon =
        demonCache[
            Math.floor(
                Math.random() *
                demonCache.length
            )
        ];


    return {
        id:
            demon.level_id ||
            demon.levelId ||
            demon.id,

        name:
            demon.name,

        position:
            demon.position,

        author:
            typeof demon.publisher === 'object'
                ? demon.publisher?.name
                : (
                    demon.publisher ||
                    demon.creator ||
                    ''
                ),

        verifier:
            typeof demon.verifier === 'object'
                ? demon.verifier?.name
                : (
                    demon.verifier ||
                    ''
                )
    };
}


// ============================================================
// TIMER
// ============================================================

function startTimer() {

    clearInterval(timerId);

    endAt =
        performance.now() +
        currentTime * 1000;

    updateTimer();

    timerId =
        setInterval(
            updateTimer,
            50
        );
}


function updateTimer() {

    const left =
        Math.max(
            0,
            endAt -
            performance.now()
        );


    $('timer').textContent =
        (left / 1000).toFixed(1);


    $('timerBar').style.width =
        (
            left /
            (currentTime * 1000) *
            100
        ) + '%';


    if (left <= 0) {

        clearInterval(timerId);

        finishRound(
            false,
            "Time's up!"
        );
    }
}


// ============================================================
// ROUND FINISH
// ============================================================

function finishRound(correct, message) {

    if (roundDone) {
        return;
    }

    roundDone = true;

    clearInterval(timerId);

    $('submitBtn').disabled = true;

    $('nextBtn').classList.remove('hidden');

    $('feedback').textContent =
        message;

    $('feedback').className =
        'feedback ' +
        (
            correct
                ? 'ok'
                : 'bad'
        );

    $('scoreLine').textContent =
        `Score: ${score}`;
}


// ============================================================
// SUBMIT ANSWER
// ============================================================

function submitAnswer() {

    if (
        roundDone ||
        !currentLevel
    ) {
        return;
    }


    const nameOK =
        nameCorrect(
            $('answer').value,
            currentLevel.name
        );


    let correct = nameOK;
    let details = '';


    // ========================================================
    // NAME + PERCENTAGE
    // ========================================================

    if (currentMode === 'namePercent') {

        const guessed =
            Number(
                $('percent').value
            );


        const target =
            Number(
                currentLevel.percent ??
                currentLevel.progress ??
                currentLevel.bestPercent ??
                randomPercent(
                    currentLevel.id
                )
            );


        const percentOK =
            Number.isFinite(guessed) &&
            Math.abs(
                guessed -
                target
            ) <= 2;


        correct =
            nameOK &&
            percentOK;


        details =
            `Correct: ${currentLevel.name} • ${target}%`;
    }


    // ========================================================
    // DEMON POSITION
    // ========================================================

    else if (currentMode === 'position') {

        const guessed =
            Number(
                $('percent').value ||
                $('answer').value
            );


        correct =
            Number.isFinite(guessed) &&
            guessed ===
            Number(
                currentLevel.position
            );


        details =
            `Correct: #${currentLevel.position} — ${currentLevel.name}`;
    }


    // ========================================================
    // NORMAL MODE
    // ========================================================

    else {

        details =
            `Correct: ${currentLevel.name}`;
    }


    if (correct) {

        score += 1;

        finishRound(
            true,
            '✓ Correct! ' +
            details
        );

    } else {

        finishRound(
            false,
            '✕ ' +
            details
        );
    }
}


// ============================================================
// PERCENTAGE FALLBACK
// ============================================================

function randomPercent(seed) {

    let number = 0;

    for (const character of String(seed)) {

        number =
            (
                number * 33 +
                character.charCodeAt(0)
            ) % 101;
    }

    return Math.max(
        1,
        number
    );
}


// ============================================================
// DAILY CHALLENGE
// ============================================================

async function startDaily(mode) {

    currentMode = mode;

    prepareGame();

    await startGame();
}


function dailySeed() {

    const date =
        new Date();

    return (
        `${date.getUTCFullYear()}-` +
        `${date.getUTCMonth() + 1}-` +
        `${date.getUTCDate()}`
    );
}


// ============================================================
// DEMON LIST PAGE
// ============================================================

async function loadDemonList() {

    const element =
        $('demonList');

    element.innerHTML =
        '<small>Loading current Demon List…</small>';


    try {

        const response =
            await fetch(
                POINTERCRATE,
                {
                    headers: {
                        Accept: 'application/json'
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                'Pointercrate request failed'
            );
        }


        const data =
            await response.json();


        demonCache =
            Array.isArray(data)
                ? data
                : (
                    data?.data ||
                    []
                );


        element.innerHTML =
            demonCache
                .slice(0, 150)
                .map((demon, index) => {

                    const publisher =
                        typeof demon.publisher === 'object'
                            ? demon.publisher?.name
                            : (
                                demon.publisher ||
                                ''
                            );


                    const verifier =
                        typeof demon.verifier === 'object'
                            ? demon.verifier?.name
                            : (
                                demon.verifier ||
                                ''
                            );


                    return `
                        <div class="list-item">

                            <span>

                                <b>
                                    #${demon.position || index + 1}
                                    — ${escapeHtml(demon.name)}
                                </b>

                                <br>

                                <small>
                                    ${escapeHtml(publisher)}
                                </small>

                            </span>

                            <small>
                                ${escapeHtml(verifier)}
                            </small>

                        </div>
                    `;
                })
                .join('');


    } catch (error) {

        console.error(error);

        element.innerHTML =
            '<small>Could not load Pointercrate right now.</small>';
    }
}


// ============================================================
// EXTREME DEMONS SEARCH
// ============================================================

async function loadExtremes() {

    const element =
        $('extremeList');

    element.innerHTML =
        '<small>Loading…</small>';


    try {

        const query =
            $('extremeSearch').value.trim();


        /*
         * If the user hasn't typed anything, use "demon".
         */

        const search =
            query ||
            'demon';


        const data =
            await searchLevels(search);


        const levels =
            Array.isArray(data)
                ? data
                : (
                    data?.levels ||
                    data?.data ||
                    []
                );


        const extremes =
            levels.filter(level => {

                const difficulty =
                    String(
                        level.difficulty ||
                        ''
                    ).toLowerCase();


                return (
                    difficulty.includes('extreme') ||
                    level.demonList
                );
            });


        element.innerHTML =
            extremes
                .slice(0, 100)
                .map(level => {

                    return `
                        <div class="list-item">

                            <span>

                                <b>
                                    ${escapeHtml(
                                        level.name ||
                                        'Unknown'
                                    )}
                                </b>

                                <br>

                                <small>
                                    ${escapeHtml(
                                        level.author ||
                                        level.creator ||
                                        ''
                                    )}
                                </small>

                            </span>

                            <small>
                                ${
                                    level.demonList
                                        ? '#' + level.demonList
                                        : 'Extreme Demon'
                                }
                            </small>

                        </div>
                    `;
                })
                .join('') ||
            '<small>No results. Try a different search.</small>';


    } catch (error) {

        console.error(error);

        element.innerHTML =
            '<small>Could not load extreme demons.</small>';
    }
}


// ============================================================
// ALL LEVELS SEARCH
// ============================================================

async function loadAllLevels() {

    const element =
        $('allLevelList');

    element.innerHTML =
        '<small>Loading…</small>';


    const query =
        $('levelSearch').value.trim() ||
        'level';


    try {

        const data =
            await searchLevels(query);


        const levels =
            Array.isArray(data)
                ? data
                : (
                    data?.levels ||
                    data?.data ||
                    []
                );


        element.innerHTML =
            levels
                .slice(0, 100)
                .map(level => {

                    const id =
                        level.id ||
                        level.levelID ||
                        level.levelId ||
                        '';


                    return `
                        <div class="list-item">

                            <span>

                                <b>
                                    ${escapeHtml(
                                        level.name ||
                                        'Unknown Level'
                                    )}
                                </b>

                                <br>

                                <small>
                                    ID ${escapeHtml(String(id))}
                                    •
                                    ${escapeHtml(
                                        level.author ||
                                        level.creator ||
                                        ''
                                    )}
                                </small>

                            </span>

                            <small>
                                ${escapeHtml(
                                    level.difficulty ||
                                    ''
                                )}
                            </small>

                        </div>
                    `;
                })
                .join('') ||
            '<small>No results.</small>';


    } catch (error) {

        console.error(error);

        element.innerHTML =
            '<small>Could not search levels.</small>';
    }
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replace(
            /[&<>"']/g,
            character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[character])
        );
}


// ============================================================
// SEARCH BUTTONS
// ============================================================

$('loadExtremes').onclick =
    loadExtremes;

$('searchLevels').onclick =
    loadAllLevels;


// ============================================================
// DAILY DATE
// ============================================================

$('dailyDate').textContent =
    `Daily seed: ${dailySeed()} • resets at 00:00 UTC`;


// ============================================================
// INITIAL LOAD
// ============================================================

loadDemonList();
```
