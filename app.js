const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = localStorage.getItem('gh_pat');
let GEMINI_KEY = localStorage.getItem('gemini_key');

let catalogData = { movies: [], tv: [] };
let globalUserData = {}; 
let currentUserData = null; 
let currentProfile = localStorage.getItem('active_profile');
let userdataSha = '';
let currentTab = 'movies';
let currentItem = null;

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    GITHUB_TOKEN = localStorage.getItem('gh_pat');
    GEMINI_KEY = localStorage.getItem('gemini_key');
    currentProfile = localStorage.getItem('active_profile');

    if (GITHUB_TOKEN && GEMINI_KEY) {
        document.getElementById('error-container').style.display = 'none';
        document.getElementById('auth-container').style.display = 'none';
        await loadData();
    } else {
        document.getElementById('profile-container').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('error-container').style.display = 'block';
    }
});

function saveTokens() {
    GITHUB_TOKEN = document.getElementById('gh-pat').value.trim();
    GEMINI_KEY = document.getElementById('gemini-key').value.trim();
    if (!GITHUB_TOKEN || !GEMINI_KEY) {
        alert('Inserisci entrambi i token!');
        return;
    }
    localStorage.setItem('gh_pat', GITHUB_TOKEN);
    localStorage.setItem('gemini_key', GEMINI_KEY);
    document.getElementById('auth-container').style.display = 'none';
    loadData();
}

async function loadData() {
    try {
        const catalogRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/catalog.json`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        if (!catalogRes.ok) throw new Error("Errore nel caricamento del catalogo.");
        catalogData = JSON.parse(b64DecodeUnicode((await catalogRes.json()).content));

        const userRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        const rawContent = await userRes.json();
        userdataSha = rawContent.sha;
        let parsedData = JSON.parse(b64DecodeUnicode(rawContent.content));

        if (parsedData.movies && !parsedData.Simone) {
            globalUserData = {
                "Simone": { movies: parsedData.movies || { ratings: {}, asked: [], watchlist: [] }, tv: parsedData.tv || { ratings: {}, asked: [], watchlist: [] } },
                "Michela": { movies: { ratings: {}, asked: [], watchlist: [] }, tv: { ratings: {}, asked: [], watchlist: [] } }
            };
            await forceSaveUserData("Migrazione formato Multi-Profilo");
        } else {
            globalUserData = parsedData;
        }

        if (currentProfile && globalUserData[currentProfile]) {
            startApp(currentProfile);
        } else {
            document.getElementById('profile-container').style.display = 'block';
        }

    } catch (err) {
        console.error(err);
        document.getElementById('profile-container').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('error-container').style.display = 'block';
    }
}

function selectProfile(profileName) {
    localStorage.setItem('active_profile', profileName);
    startApp(profileName);
}

function changeProfile() {
    localStorage.removeItem('active_profile');
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'block';
}

function startApp(profileName) {
    currentProfile = profileName;
    currentUserData = globalUserData[currentProfile];
    
    if(!currentUserData.movies) currentUserData.movies = { ratings:{}, asked:[], watchlist:[] };
    if(!currentUserData.tv) currentUserData.tv = { ratings:{}, asked:[], watchlist:[] };
    if(!currentUserData.movies.watchlist) currentUserData.movies.watchlist = [];
    if(!currentUserData.tv.watchlist) currentUserData.tv.watchlist = [];

    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    document.getElementById('current-profile-display').innerText = `👁️ Profilo: ${currentProfile}`;

    renderNextItem();
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    document.getElementById('gemini-output').style.display = 'none';
    renderNextItem();
}

function renderNextItem() {
    const items = catalogData[currentTab];
    const askedList = currentUserData[currentTab].asked || [];
    
    const unseenItems = items.filter(i => !askedList.includes(i.id));
    
    if (unseenItems.length === 0) {
        document.getElementById('item-content').innerHTML = "<h2>Hai esaurito il catalogo!</h2><p>L'aggiornamento automatico porterà presto nuovi titoli.</p>";
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * unseenItems.length);
    currentItem = unseenItems[randomIndex];
    
    document.getElementById('item-title').innerText = `${currentItem.title} (${currentItem.year})`;
    const posterSrc = currentItem.poster || 'https://via.placeholder.com/200x300?text=No+Poster';
    document.getElementById('item-poster').src = posterSrc;
    document.getElementById('item-details').innerText = `Generi: ${(currentItem.genres || []).join(', ')} | Su: ${(currentItem.platforms || []).join(', ')}`;
    
    // Tasto Trailer
    const btnTrailer = document.getElementById('btn-trailer');
    btnTrailer.onclick = () => {
        const query = encodeURIComponent(`${currentItem.title} ${currentItem.year} trailer ita`);
        window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
    };

    const partialBtn = document.getElementById('btn-partial');
    partialBtn.style.display = currentTab === 'tv' ? 'inline-block' : 'none';
}

async function rateItem(score, isPartial = false) {
    if (!currentItem) return;
    showLoading(true);
    currentUserData[currentTab].ratings[currentItem.id] = { rating: score, seen: true, partial: isPartial, timestamp: new Date().toISOString() };
    currentUserData[currentTab].asked.push(currentItem.id);
    await saveUserData();
    showLoading(false);
    renderNextItem();
}

function askPartialRating() {
    if (!currentItem) return;
    const scoreStr = prompt(`Hai iniziato ${currentItem.title} ma non l'hai finito.\n\nFino al punto in cui l'hai visto, che voto gli daresti? (da 1 a 5)`);
    if (scoreStr === null) return; 
    const score = parseInt(scoreStr);
    if (isNaN(score) || score < 1 || score > 5) return alert("Inserisci un numero valido da 1 a 5.");
    rateItem(score, true);
}

async function markNotSeen() {
    if (!currentItem) return;
    showLoading(true);
    currentUserData[currentTab].ratings[currentItem.id] = { seen: false, timestamp: new Date().toISOString() };
    currentUserData[currentTab].asked.push(currentItem.id);
    await saveUserData();
    showLoading(false);
    renderNextItem();
}

function skipItem() {
    if (!currentItem) return;
    currentUserData[currentTab].asked.push(currentItem.id);
    renderNextItem();
}

async function addCurrentToWatchlist() {
    if (!currentItem) return;
    if(!currentUserData[currentTab].watchlist) currentUserData[currentTab].watchlist = [];
    if(currentUserData[currentTab].watchlist.find(i => i.title.toLowerCase() === currentItem.title.toLowerCase())) {
        return alert("Questo titolo è già nella tua Watchlist!");
    }
    showLoading(true);
    currentUserData[currentTab].watchlist.push({
        id: currentItem.id, title: currentItem.title, year: currentItem.year,
        reason: "Aggiunto manualmente durante il quiz.", addedAt: new Date().toISOString()
    });
    currentUserData[currentTab].asked.push(currentItem.id);
    await saveUserData();
    showLoading(false);
    renderNextItem();
}

async function saveUserData() {
    await forceSaveUserData(`Update per ${currentProfile}`);
}

async function forceSaveUserData(commitMessage) {
    const content = b64EncodeUnicode(JSON.stringify(globalUserData, null, 2));
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: commitMessage, content: content, sha: userdataSha })
        });
        if (!response.ok) throw new Error('Errore salvataggio GitHub');
        userdataSha = (await response.json()).content.sha;
    } catch (err) {
        console.error(err);
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('item-content').style.opacity = show ? '0.3' : '1';
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function fetchGeminiRecommendations(promptStr, titleColor = '#b16eff', titleText = '✨ I Consigli di Gemini') {
    document.getElementById('gemini-output').style.display = 'block';
    document.getElementById('gemini-output').innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <div style="font-size: 2.5em; margin-bottom: 15px; animation: pulse 1.5s infinite;">🤖</div>
            <em style="color: var(--text-muted);">Elaborazione in corso...</em>
        </div>
    `;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptStr }] }],
                generationConfig: { temperature: 0.9, topK: 40 }
            })
        });

        const data = await res.json();
        let text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const suggestions = JSON.parse(text);
        
        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(138,43,226,0.3); padding-bottom:10px; margin-bottom:15px;">
                <h3 style="margin:0; color:${titleColor};">${titleText}</h3>
                <button onclick="document.getElementById('gemini-output').style.display='none'" style="background:none; border:none; color:#aaa; font-size:1.5em; cursor:pointer; padding:0; line-height:1;">&times;</button>
            </div>
            <ul style='padding-left: 20px; margin:0;'>
        `;
        suggestions.forEach(s => {
            const escapedTitle = s.title.replace(/'/g, "\\'");
            const escapedReason = s.reason.replace(/'/g, "\\'");
            html += `
                <li style="margin-bottom: 15px;">
                    <strong style="color:var(--accent-color); font-size:1.1em;">${s.title} (${s.year})</strong><br>
                    <span style="font-size:0.9em; color:#ddd;">${s.reason}</span><br>
                    <div style="display: flex; gap: 10px; margin-top: 8px;">
                        <button class="btn-primary" style="background-color: var(--success-color); padding: 5px 10px; font-size: 0.8em; width: auto;" 
                                onclick="addToWatchlist('${escapedTitle}', ${s.year}, '${escapedReason}')">+ Salva in Watchlist</button>
                        <button class="btn-tertiary" style="padding: 5px 10px; font-size: 0.8em; width: auto; border-color: #555;" 
                                onclick="window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(s.title + ' ' + s.year + ' trailer ita')}', '_blank')">▶️ Trailer</button>
                    </div>
                </li>
            `;
        });
        html += "</ul>";
        document.getElementById('gemini-output').innerHTML = html;

    } catch (err) {
        console.error(err);
        document.getElementById('gemini-output').innerHTML = `
            <div style='padding:20px; text-align:center;'>
                <em style='color:#ff5252;'>Errore. Controlla la tua API Key o riprova tra poco.</em><br><br>
                <button onclick="document.getElementById('gemini-output').style.display='none'" class="btn-secondary" style="width: auto; padding: 5px 15px;">Chiudi</button>
            </div>
        `;
    }
}

function askGemini() {
    const ratingsObj = currentUserData[currentTab].ratings;
    const allRatings = Object.keys(ratingsObj).filter(id => ratingsObj[id].seen).map(id => {
        const cat = catalogData[currentTab].find(i => i.id == id);
        return { title: cat ? cat.title : '', genres: cat ? (cat.genres || []).join(', ') : '', rating: ratingsObj[id].rating, partial: ratingsObj[id].partial };
    });

    let pos = shuffleArray(allRatings.filter(r => r.rating >= 4 && !r.partial)).slice(0, 30).map(r => `"${r.title}" (${r.genres})`);
    let neg = shuffleArray(allRatings.filter(r => r.rating <= 2 && !r.partial)).slice(0, 15).map(r => `"${r.title}"`);
    let abn = shuffleArray(allRatings.filter(r => r.partial)).slice(0, 10).map(r => `"${r.title}"`);

    const doNotSuggest = [...new Set([...allRatings.map(r=>r.title), ...(currentUserData[currentTab].watchlist || []).map(w=>w.title)])].filter(Boolean);
    const num = currentTab === 'movies' ? 10 : 5;
    const typeStr = currentTab === 'movies' ? 'film' : 'serie tv';

    let prompt = `Agisci come esperto di ${typeStr}. Consiglia ${num} ${typeStr} all'utente.
AMATI: ${pos.join(', ')}.
ODIATI: ${neg.join(', ')}.
${abn.length > 0 ? `ABBANDONATI: ${abn.join(', ')}.\n` : ''}
DIVIETO ASSOLUTO SU: ${JSON.stringify(doNotSuggest)}.
Requisiti: disponibili in Italia (Netflix, Prime, Disney, NowTV). Sii vario.
Rispondi in JSON: [{"title": "Nome", "year": 2023, "reason": "Motivo..."}] (senza markdown o testo extra).`;

    fetchGeminiRecommendations(prompt);
}

function askGeminiCouple() {
    const profA = globalUserData['Simone'] || { movies:{ratings:{}, watchlist:[]}, tv:{ratings:{}, watchlist:[]} };
    const profB = globalUserData['Michela'] || { movies:{ratings:{}, watchlist:[]}, tv:{ratings:{}, watchlist:[]} };

    const getPositives = (prof) => {
        const rObj = prof[currentTab].ratings;
        return Object.keys(rObj).filter(id => rObj[id].seen && rObj[id].rating >= 4 && !rObj[id].partial).map(id => {
            const cat = catalogData[currentTab].find(i => i.id == id);
            return cat ? `"${cat.title}"` : null;
        }).filter(Boolean);
    };

    const getSeenOrWatchlist = (prof) => {
        const rObj = prof[currentTab].ratings;
        const seen = Object.keys(rObj).filter(id => rObj[id].seen).map(id => {
            const cat = catalogData[currentTab].find(i => i.id == id);
            return cat ? cat.title : null;
        });
        const wl = (prof[currentTab].watchlist || []).map(w => w.title);
        return [...seen, ...wl].filter(Boolean);
    };

    let posA = shuffleArray(getPositives(profA)).slice(0, 20);
    let posB = shuffleArray(getPositives(profB)).slice(0, 20);
    const doNotSuggest = [...new Set([...getSeenOrWatchlist(profA), ...getSeenOrWatchlist(profB)])];
    
    const num = currentTab === 'movies' ? 5 : 4;
    const typeStr = currentTab === 'movies' ? 'film' : 'serie tv';

    let prompt = `Agisci come consulente di coppia per ${typeStr}. Trova ${num} titoli che mettano d'accordo Simone e Michela per la serata.
SIMONE AMA: ${posA.join(', ')}.
MICHELA AMA: ${posB.join(', ')}.
DIVIETO ASSOLUTO SU (già visti da almeno uno dei due o in lista): ${JSON.stringify(doNotSuggest)}.
Cerca compromessi perfetti o titoli che fondono i loro gusti. Disponibili in Italia.
Rispondi in JSON puro: [{"title": "Nome", "year": 2023, "reason": "Motivo..."}]`;

    fetchGeminiRecommendations(prompt, '#ff416c', '👩‍❤️‍👨 Match di Coppia: Consigliati per entrambi');
}

async function addToWatchlist(title, year, reason) {
    if(!currentUserData[currentTab].watchlist) currentUserData[currentTab].watchlist = [];
    if(currentUserData[currentTab].watchlist.find(i => i.title.toLowerCase() === title.toLowerCase())) {
        return alert("Questo titolo è già nella tua Watchlist!");
    }
    currentUserData[currentTab].watchlist.push({
        title: title, year: year, reason: reason, addedAt: new Date().toISOString()
    });
    await saveUserData();
    alert(`"${title}" aggiunto alla Watchlist di ${currentProfile}!`);
}