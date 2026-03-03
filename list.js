const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = localStorage.getItem('gh_pat');

let catalogData = { movies: [], tv: [] };
let userData = { movies: { ratings: {}, asked: [], watchlist: [] }, tv: { ratings: {}, asked: [], watchlist: [] } };
let currentTab = 'movies';
let currentView = 'history'; // history | watchlist

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

async function b64EncodeUnicodeAsync(str) {
    // Implementazione asincrona non serve qui se non modifichiamo file,
    // ma la teniamo per coerenza se decidessimo di rimuovere roba dalla watchlist.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!GITHUB_TOKEN) {
        alert("Devi prima inserire il Token GitHub nella Home page!");
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('app-nav').style.display = 'flex';
    document.getElementById('view-toggle').style.display = 'flex';
    document.getElementById('app-main').style.display = 'flex';
    await loadData();
});

async function loadData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('list-output').innerHTML = '';
    
    try {
        const catalogRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/catalog.json`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        catalogData = JSON.parse(b64DecodeUnicode((await catalogRes.json()).content));

        const userRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            cache: 'no-store'
        });
        userData = JSON.parse(b64DecodeUnicode((await userRes.json()).content));
        
        // Safety check sulle strutture dati
        if(!userData.movies.watchlist) userData.movies.watchlist = [];
        if(!userData.tv.watchlist) userData.tv.watchlist = [];

        renderList();
    } catch (err) {
        console.error(err);
        alert("Errore nel caricamento dei dati da GitHub.");
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    renderList();
}

function setView(view) {
    currentView = view;
    document.getElementById('btn-history').classList.toggle('active', view === 'history');
    document.getElementById('btn-watchlist').classList.toggle('active', view === 'watchlist');
    renderList();
}

function renderList() {
    const listOutput = document.getElementById('list-output');
    const emptyState = document.getElementById('empty-state');
    listOutput.innerHTML = '';
    
    if (currentView === 'history') {
        const ratings = userData[currentTab]?.ratings || {};
        const items = catalogData[currentTab] || [];
        
        const ratedItems = Object.keys(ratings)
            .filter(id => ratings[id].seen === true)
            .map(id => {
                const catalogItem = items.find(i => i.id == id);
                return {
                    ...catalogItem,
                    rating: ratings[id].rating,
                    timestamp: ratings[id].timestamp
                };
            })
            .filter(i => i.title); // Rimuove eventuali orfani
            
        ratedItems.sort((a, b) => b.rating - a.rating || new Date(b.timestamp) - new Date(a.timestamp));

        if (ratedItems.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        
        ratedItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const poster = item.poster || 'https://via.placeholder.com/60x90?text=No+Poster';
            
            div.innerHTML = `
                <img src="${poster}" alt="${item.title}">
                <div class="list-item-content">
                    <h3>${item.title} (${item.year})</h3>
                    <p>${(item.genres || []).join(', ')}</p>
                    <p style="font-size:0.8em; margin-top:4px;">Su: ${(item.platforms || []).join(', ')}</p>
                </div>
                <div class="list-item-rating">
                    ${item.rating} ⭐
                </div>
            `;
            listOutput.appendChild(div);
        });

    } else if (currentView === 'watchlist') {
        // Render Watchlist di Gemini
        const watchlist = userData[currentTab]?.watchlist || [];
        
        if (watchlist.length === 0) {
            emptyState.style.display = 'block';
            emptyState.innerHTML = "<h2>La tua Watchlist è vuota.</h2><p>Chiedi a Gemini dei consigli dalla Home e salvali qui!</p>";
            return;
        }

        emptyState.style.display = 'none';

        // Inverti array per avere gli ultimi salvati in alto
        const reversedList = [...watchlist].reverse();
        
        reversedList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'flex-start';
            
            div.innerHTML = `
                <h3 style="color: var(--accent-color); margin-bottom: 5px;">${item.title} (${item.year})</h3>
                <p style="color: #ddd; font-style: italic;">"${item.reason}"</p>
            `;
            listOutput.appendChild(div);
        });
    }
}