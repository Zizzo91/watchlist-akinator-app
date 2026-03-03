const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = '';

let catalogData = { movies: [], tv: [] };
let userData = { movies: { ratings: {}, asked: [] }, tv: { ratings: {}, asked: [] } };
let userdataSha = '';

let currentTab = 'movies';
let currentItem = null;

// Utility per decodificare il Base64 di GitHub (che gestisce male l'UTF-8 nativo)
function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

// Utility per codificare in Base64 (supporto UTF-8)
function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('gh_pat');
    if (savedToken) {
        document.getElementById('gh-token').value = savedToken;
        saveToken();
    }
});

async function saveToken() {
    GITHUB_TOKEN = document.getElementById('gh-token').value.trim();
    if (!GITHUB_TOKEN) return alert('Inserisci il token!');
    
    localStorage.setItem('gh_pat', GITHUB_TOKEN);
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-nav').style.display = 'flex';
    document.getElementById('app-main').style.display = 'block';
    
    await loadData();
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    document.getElementById('recs-output').style.display = 'none';
    renderNextItem();
}

async function fetchFromGitHub(path) {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/${path}`, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    if (!response.ok) throw new Error(`Errore fetch ${path}: ${response.statusText}`);
    return response.json();
}

async function loadData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('card-container').style.display = 'none';

    try {
        // Carica Catalogo
        const catalogRes = await fetchFromGitHub('catalog.json');
        catalogData = JSON.parse(b64DecodeUnicode(catalogRes.content));

        // Carica Dati Utente
        const userRes = await fetchFromGitHub('userdata.json');
        userdataSha = userRes.sha;
        userData = JSON.parse(b64DecodeUnicode(userRes.content));

        renderNextItem();
    } catch (err) {
        alert("Errore nel caricamento dei dati. Controlla il Token PAT e i permessi del repo 'my-watchlist-data'.");
        console.error(err);
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('app-nav').style.display = 'none';
        document.getElementById('app-main').style.display = 'none';
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function renderNextItem() {
    const items = catalogData[currentTab];
    const asked = userData[currentTab].asked || [];
    
    // Trova il primo elemento non ancora chiesto
    currentItem = items.find(item => !asked.includes(item.id));

    if (!currentItem) {
        document.getElementById('card-container').style.display = 'none';
        document.getElementById('no-more-items').style.display = 'block';
        return;
    }

    document.getElementById('card-container').style.display = 'block';
    document.getElementById('no-more-items').style.display = 'none';

    document.getElementById('item-poster').src = currentItem.poster;
    document.getElementById('item-title').textContent = currentItem.title;
    document.getElementById('item-details').textContent = 
        `${currentItem.year} | ${currentItem.genres.join(', ')} | ${currentItem.platforms.join(', ')}`;
}

async function rateItem(stars) {
    if(!currentItem) return;
    
    userData[currentTab].ratings[currentItem.id] = {
        rating: stars,
        seen: true,
        timestamp: new Date().toISOString()
    };
    userData[currentTab].asked.push(currentItem.id);
    
    await saveUserData();
    renderNextItem();
}

async function markNotSeen() {
    if(!currentItem) return;
    
    userData[currentTab].ratings[currentItem.id] = {
        seen: false,
        timestamp: new Date().toISOString()
    };
    userData[currentTab].asked.push(currentItem.id);
    
    await saveUserData();
    renderNextItem();
}

async function skipItem() {
    if(!currentItem) return;
    // Lo inseriamo nei chiesti per non mostrarlo subito, ma senza rating
    userData[currentTab].asked.push(currentItem.id);
    await saveUserData();
    renderNextItem();
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
                message: "Update user ratings via Web App",
                content: content,
                sha: userdataSha
            })
        });
        
        if (!response.ok) throw new Error('Errore nel salvataggio');
        const data = await response.json();
        userdataSha = data.content.sha; // Aggiorna lo SHA per la prossima scrittura
    } catch (err) {
        console.error("Salvataggio fallito:", err);
        alert("Errore nel salvataggio su GitHub. Controlla la console.");
    }
}

// Logica locale basilare per i consigli (MVP senza API Gemini per ora)
function generateRecommendations() {
    const ratings = userData[currentTab].ratings;
    const topRatedIds = Object.keys(ratings).filter(id => ratings[id].rating >= 4);
    
    const recsBox = document.getElementById('recs-output');
    recsBox.style.display = 'block';
    
    if (topRatedIds.length === 0) {
        recsBox.innerHTML = "<p>Valuta qualche titolo con 4 o 5 stelle prima di chiedere consigli!</p>";
        return;
    }

    // Identifica i generi preferiti dai top rated
    let favoriteGenres = {};
    topRatedIds.forEach(id => {
        const item = catalogData[currentTab].find(i => i.id == id);
        if(item) {
            item.genres.forEach(g => {
                favoriteGenres[g] = (favoriteGenres[g] || 0) + 1;
            });
        }
    });

    const topGenres = Object.entries(favoriteGenres)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);

    // Testo pronto da inviare a Gemini (o mostrato in locale)
    let promptText = `Ho valutato molto positivamente titoli che includono generi come: ${topGenres.join(', ')}.\n`;
    promptText += "In futuro qui ci sarà la risposta dell'intelligenza artificiale (Gemini) integrando le sue API.";

    recsBox.innerHTML = `<h3>I tuoi gusti (Logica base)</h3>
                         <p>I tuoi generi preferiti sembrano essere: <strong>${topGenres.join(', ')}</strong>.</p>
                         <hr>
                         <p><em>Prossimo step: Inviare questi dati a Gemini per farsi generare 5 titoli non visti sulle piattaforme che possiedi!</em></p>`;
}