const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = localStorage.getItem('gh_pat');
let GEMINI_KEY = localStorage.getItem('gemini_key');

let catalogData = { movies: [], tv: [] };
let globalUserData = {}; // Contiene i dati di tutti i profili
let currentUserData = null; // Punta a globalUserData[currentProfile]
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
        if (!catalogRes.ok) throw new Error("Errore nel caricamento del catalogo. Token invalido?");
        catalogData = JSON.parse(b64DecodeUnicode((await catalogRes.json()).content));

        const userRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        const rawContent = await userRes.json();
        userdataSha = rawContent.sha;
        let parsedData = JSON.parse(b64DecodeUnicode(rawContent.content));

        if (parsedData.movies && !parsedData.Simone) {
            console.log("Migrazione dati al formato Multi-Profilo in corso...");
            globalUserData = {
                "Simone": {
                    movies: parsedData.movies || { ratings: {}, asked: [], watchlist: [] },
                    tv: parsedData.tv || { ratings: {}, asked: [], watchlist: [] }
                },
                "Michela": {
                    movies: { ratings: {}, asked: [], watchlist: [] },
                    tv: { ratings: {}, asked: [], watchlist: [] }
                }
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
        // Rimuoviamo i token dal localstorage perché probabilmente sono errati/scaduti
        localStorage.removeItem('gh_pat');
        localStorage.removeItem('gemini_key');
        GITHUB_TOKEN = null;
        GEMINI_KEY = null;
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
        document.getElementById('item-content').innerHTML = "<h2>Hai esaurito il catalogo!</h2><p>Vai su 'Aggiorna TMDB' per aggiungere nuovi titoli.</p>";
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * unseenItems.length);
    currentItem = unseenItems[randomIndex];
    
    document.getElementById('item-title').innerText = `${currentItem.title} (${currentItem.year})`;
    const posterSrc = currentItem.poster || 'https://via.placeholder.com/200x300?text=No+Poster';
    document.getElementById('item-poster').src = posterSrc;
    document.getElementById('item-details').innerText = `Generi: ${(currentItem.genres || []).join(', ')} | Su: ${(currentItem.platforms || []).join(', ')}`;
}

async function rateItem(score) {
    if (!currentItem) return;
    showLoading(true);
    
    currentUserData[currentTab].ratings[currentItem.id] = { rating: score, seen: true, timestamp: new Date().toISOString() };
    currentUserData[currentTab].asked.push(currentItem.id);
    
    await saveUserData();
    showLoading(false);
    renderNextItem();
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

async function saveUserData() {
    await forceSaveUserData(`Aggiunta valutazione ${currentTab} per ${currentProfile}`);
}

async function forceSaveUserData(commitMessage) {
    const content = b64EncodeUnicode(JSON.stringify(globalUserData, null, 2));
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: content,
                sha: userdataSha
            })
        });
        
        if (!response.ok) throw new Error('Errore nel salvataggio su GitHub');
        const data = await response.json();
        userdataSha = data.content.sha;
    } catch (err) {
        console.error("Salvataggio fallito:", err);
        alert("Si è verificato un errore nel salvataggio dei dati su GitHub.");
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('item-content').style.opacity = show ? '0.3' : '1';
}

async function askGemini() {
    document.getElementById('gemini-output').style.display = 'block';
    document.getElementById('gemini-output').innerHTML = "<em>L'Intelligenza Artificiale sta analizzando i tuoi gusti...</em>";
    
    const ratings = currentUserData[currentTab].ratings;
    const items = catalogData[currentTab];
    const watchlist = currentUserData[currentTab].watchlist || [];
    
    const positiveItems = Object.keys(ratings)
        .filter(id => ratings[id].seen && ratings[id].rating >= 4)
        .map(id => items.find(i => i.id == id)?.title)
        .filter(t => t);
        
    const negativeItems = Object.keys(ratings)
        .filter(id => ratings[id].seen && ratings[id].rating <= 2)
        .map(id => items.find(i => i.id == id)?.title)
        .filter(t => t);

    const evaluatedTitles = Object.keys(ratings)
        .filter(id => ratings[id].seen)
        .map(id => items.find(i => i.id == id)?.title)
        .filter(t => t);
    
    const watchlistTitles = watchlist.map(w => w.title);
    const doNotSuggest = [...evaluatedTitles, ...watchlistTitles];
        
    const prompt = `Sei un esperto di ${currentTab === 'movies' ? 'film' : 'serie tv'}.
L'utente ${currentProfile} ha apprezzato molto: ${positiveItems.join(', ')}.
Non gli sono piaciuti molto: ${negativeItems.join(', ')}.
NON suggerire assolutamente questi titoli perché li conosce già o li ha in lista: ${doNotSuggest.join(', ')}.

Suggerisci 3 ${currentTab === 'movies' ? 'film' : 'serie tv'} disponibili in streaming in Italia che potrebbero piacergli moltissimo.
Rispondi in formato JSON ESATTO con questa struttura:
[
  { "title": "Titolo", "year": 2023, "reason": "Breve motivo per cui gli piacerà in base ai suoi gusti" }
]
Solo il JSON valido, niente formattazione markdown.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
            })
        });

        const data = await res.json();
        let text = data.candidates[0].content.parts[0].text;
        
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const suggestions = JSON.parse(text);
        
        let html = "<ul style='padding-left: 20px;'>";
        suggestions.forEach(s => {
            const escapedTitle = s.title.replace(/'/g, "\\'");
            const escapedReason = s.reason.replace(/'/g, "\\'");
            html += `
                <li>
                    <strong>${s.title} (${s.year})</strong><br>
                    <span class="small-text">${s.reason}</span><br>
                    <button class="btn-primary" style="background-color: var(--success-color); padding: 5px 10px; margin-top: 8px; font-size: 0.8em; width: auto;" 
                            onclick="addToWatchlist('${escapedTitle}', ${s.year}, '${escapedReason}')">
                        + Salva in Watchlist
                    </button>
                </li>
            `;
        });
        html += "</ul>";
        document.getElementById('gemini-output').innerHTML = html;

    } catch (err) {
        console.error(err);
        document.getElementById('gemini-output').innerHTML = "<em style='color:red;'>Errore nella generazione con Gemini. Riprova.</em>";
    }
}

async function addToWatchlist(title, year, reason) {
    if(!currentUserData[currentTab].watchlist) currentUserData[currentTab].watchlist = [];
    
    const exists = currentUserData[currentTab].watchlist.find(i => i.title === title);
    if(exists) {
        alert("Questo titolo è già nella tua Watchlist!");
        return;
    }
    
    currentUserData[currentTab].watchlist.push({
        title: title,
        year: year,
        reason: reason,
        addedAt: new Date().toISOString()
    });
    
    await saveUserData();
    alert(`"${title}" aggiunto alla Watchlist di ${currentProfile}!`);
}