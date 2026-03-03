const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = '';
let GEMINI_TOKEN = '';

let catalogData = { movies: [], tv: [] };
let userData = { movies: { ratings: {}, asked: [], watchlist: [] }, tv: { ratings: {}, asked: [], watchlist: [] } };
let userdataSha = '';

let currentTab = 'movies';
let currentItem = null;
let lastGeminiRecs = []; // Array per salvare temporaneamente i consigli prima del commit in watchlist

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

document.addEventListener('DOMContentLoaded', () => {
    const savedGhToken = localStorage.getItem('gh_pat');
    const savedGeminiToken = localStorage.getItem('gemini_token');
    
    if (savedGhToken) document.getElementById('gh-token').value = savedGhToken;
    if (savedGeminiToken) document.getElementById('gemini-token').value = savedGeminiToken;
    
    if (savedGhToken && savedGeminiToken) {
        saveTokens();
    }
});

async function saveTokens() {
    GITHUB_TOKEN = document.getElementById('gh-token').value.trim();
    GEMINI_TOKEN = document.getElementById('gemini-token').value.trim();
    
    if (!GITHUB_TOKEN) return alert('Inserisci il token di GitHub!');
    if (!GEMINI_TOKEN) return alert('Inserisci la chiave API di Gemini!');
    
    localStorage.setItem('gh_pat', GITHUB_TOKEN);
    localStorage.setItem('gemini_token', GEMINI_TOKEN);
    
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-nav').style.display = 'flex';
    document.getElementById('links-container').style.display = 'flex';
    document.getElementById('app-main').style.display = 'block';
    document.getElementById('btn-logout').style.display = 'block';
    
    await loadData();
}

function clearTokens() {
    if(confirm("Vuoi cancellare i token salvati e reinserirli?")) {
        localStorage.removeItem('gh_pat');
        localStorage.removeItem('gemini_token');
        location.reload();
    }
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    document.getElementById('recs-output').style.display = 'none';
    document.getElementById('save-recs-btn').style.display = 'none';
    renderNextItem();
}

async function fetchFromGitHub(path) {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/${path}`, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Errore fetch ${path}: ${response.statusText}`);
    return response.json();
}

async function loadData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('card-container').style.display = 'none';

    try {
        const catalogRes = await fetchFromGitHub('catalog.json');
        catalogData = JSON.parse(b64DecodeUnicode(catalogRes.content));

        const userRes = await fetchFromGitHub('userdata.json');
        userdataSha = userRes.sha;
        userData = JSON.parse(b64DecodeUnicode(userRes.content));

        if(!userData.movies) userData.movies = { ratings: {}, asked: [], watchlist: [] };
        if(!userData.tv) userData.tv = { ratings: {}, asked: [], watchlist: [] };
        if(!userData.movies.watchlist) userData.movies.watchlist = [];
        if(!userData.tv.watchlist) userData.tv.watchlist = [];

        renderNextItem();
    } catch (err) {
        alert("Errore nel caricamento dei dati. Assicurati che i token siano corretti e che catalog.json esista.");
        console.error(err);
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('app-nav').style.display = 'none';
        document.getElementById('links-container').style.display = 'none';
        document.getElementById('app-main').style.display = 'none';
        document.getElementById('btn-logout').style.display = 'none';
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function renderNextItem() {
    const items = catalogData[currentTab] || [];
    const asked = userData[currentTab].asked || [];
    
    currentItem = items.find(item => !asked.includes(item.id));

    if (!currentItem) {
        document.getElementById('card-container').style.display = 'none';
        document.getElementById('no-more-items').style.display = 'block';
        return;
    }

    document.getElementById('card-container').style.display = 'block';
    document.getElementById('no-more-items').style.display = 'none';

    const posterUrl = currentItem.poster || 'https://via.placeholder.com/300x450?text=No+Poster';
    document.getElementById('item-poster').src = posterUrl;
    document.getElementById('item-title').textContent = currentItem.title;
    
    const genres = (currentItem.genres || []).join(', ');
    const platforms = (currentItem.platforms || []).join(', ');
    document.getElementById('item-details').textContent = `${currentItem.year} | ${genres} | ${platforms}`;
}

async function rateItem(stars) {
    if(!currentItem) return;
    userData[currentTab].ratings[currentItem.id] = { rating: stars, seen: true, timestamp: new Date().toISOString() };
    userData[currentTab].asked.push(currentItem.id);
    renderNextItem();
    await saveUserData();
}

async function markNotSeen() {
    if(!currentItem) return;
    userData[currentTab].ratings[currentItem.id] = { seen: false, timestamp: new Date().toISOString() };
    userData[currentTab].asked.push(currentItem.id);
    renderNextItem();
    await saveUserData();
}

async function skipItem() {
    if(!currentItem) return;
    userData[currentTab].asked.push(currentItem.id);
    renderNextItem();
    await saveUserData();
}

async function saveUserData() {
    const content = b64EncodeUnicode(JSON.stringify(userData, null, 2));
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "Akinator: Update user progress",
                content: content,
                sha: userdataSha
            })
        });
        
        if (!response.ok) throw new Error('Errore nel salvataggio su GitHub');
        const data = await response.json();
        userdataSha = data.content.sha;
    } catch (err) {
        console.error("Salvataggio fallito:", err);
    }
}

// Integrazione API Google Gemini JSON Mode
async function generateGeminiRecommendations() {
    const recsBox = document.getElementById('recs-output');
    const loadingBox = document.getElementById('recs-loading');
    const saveBtn = document.getElementById('save-recs-btn');
    
    recsBox.style.display = 'none';
    saveBtn.style.display = 'none';
    loadingBox.style.display = 'block';

    const ratings = userData[currentTab].ratings;
    const typeLabel = currentTab === 'movies' ? 'film' : 'serie TV';
    
    let loved = [];
    let disliked = [];

    // Crea elenchi anche con roba in watchlist per dirgli di non suggerirla
    const existingWatchlistTitles = (userData[currentTab].watchlist || []).map(w => w.title);

    Object.keys(ratings).forEach(id => {
        const item = catalogData[currentTab].find(i => i.id == id);
        if(!item) return;
        
        const r = ratings[id];
        if(r.rating >= 4) {
            loved.push(item.title);
        } else if(r.rating <= 2) {
            disliked.push(item.title);
        }
    });

    if (loved.length === 0) {
        loadingBox.style.display = 'none';
        recsBox.style.display = 'block';
        recsBox.innerHTML = `<p>Devi valutare almeno un paio di ${typeLabel} con 4 o 5 stelle prima di poter chiedere consigli all'IA!</p>`;
        return;
    }

    const prompt = `
Sei un esperto consigliere di ${typeLabel}. Basandoti su questi gusti:
- Titoli AMATI: ${loved.join(', ')}
- Titoli NON PIACIUTI: ${disliked.length > 0 ? disliked.join(', ') : 'Nessuno finora'}
- GIA' NELLA WATCHLIST: ${existingWatchlistTitles.length > 0 ? existingWatchlistTitles.join(', ') : 'Nessuno'}

Trova i 5 migliori ${typeLabel} che l'utente quasi certamente adorerà. 
NON PROPORRE ASSOLUTAMENTE i titoli che sono già negli elenchi "AMATI", "NON PIACIUTI" o "GIA' NELLA WATCHLIST".

RESTITUISCI SOLO UN ARRAY JSON VALIDO (senza markdown blocks o backticks).
Formato obbligatorio:
[
  {
    "title": "Titolo Esatto del Film o Serie",
    "year": 2023,
    "reason": "Perché ha amato X e Y, questo thriller psicologico è perfetto..."
  }
]`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_TOKEN}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    temperature: 0.7,
                    responseMimeType: "application/json" 
                }
            })
        });

        if(!response.ok) throw new Error("Errore API Gemini");

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text;
        
        lastGeminiRecs = JSON.parse(jsonText);
        
        let htmlOutput = "<h3>🤖 L'IA ti consiglia:</h3><ul style='padding-left:20px;'>";
        lastGeminiRecs.forEach(rec => {
            htmlOutput += `<li style='margin-bottom: 10px;'>
                <strong>${rec.title} (${rec.year})</strong><br>
                <span style='color:#bbb; font-size:0.9em;'>${rec.reason}</span>
            </li>`;
        });
        htmlOutput += "</ul>";
        
        recsBox.innerHTML = htmlOutput;
        saveBtn.style.display = 'block'; // Mostra il bottone per salvare

    } catch (err) {
        console.error("Errore Gemini:", err);
        recsBox.innerHTML = `<p style="color:red;"><strong>Errore:</strong> Impossibile generare consigli. Riprova.</p>`;
    } finally {
        loadingBox.style.display = 'none';
        recsBox.style.display = 'block';
    }
}

async function saveGeminiRecommendations() {
    if(lastGeminiRecs.length === 0) return;
    
    const saveBtn = document.getElementById('save-recs-btn');
    saveBtn.innerText = "⏳ Salvataggio in corso...";
    saveBtn.disabled = true;

    // Aggiungi all'array esistente della watchlist
    const currentList = userData[currentTab].watchlist || [];
    
    lastGeminiRecs.forEach(rec => {
        // Aggiungi timestamp e un ID fittizio generato dal titolo per sicurezza
        currentList.push({
            id: 'gemini_' + Date.now() + Math.floor(Math.random()*1000),
            title: rec.title,
            year: rec.year,
            reason: rec.reason,
            timestamp: new Date().toISOString()
        });
    });

    userData[currentTab].watchlist = currentList;

    await saveUserData();

    saveBtn.innerText = "✅ Salvato in Watchlist!";
    saveBtn.style.backgroundColor = "#1b5e20";
    setTimeout(() => { saveBtn.style.display = 'none'; }, 3000);
}