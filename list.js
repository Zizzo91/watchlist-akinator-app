const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = localStorage.getItem('gh_pat');

let catalogData = { movies: [], tv: [] };
let globalUserData = {};
let userData = null;
let currentProfile = localStorage.getItem('active_profile');
let userdataSha = '';
let currentTab = 'movies';
let currentView = 'history';
let searchQuery = '';

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
    if (!GITHUB_TOKEN) {
        alert("Devi prima inserire il Token GitHub nella Home page!");
        window.location.href = 'index.html';
        return;
    }
    if (!currentProfile) {
        alert("Devi prima selezionare un Profilo dalla Home!");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('profile-name-header').innerText = `Lista di ${currentProfile}`;
    
    document.getElementById('app-nav').style.display = 'flex';
    document.getElementById('view-toggle').style.display = 'flex';
    document.getElementById('search-container').style.display = 'block';
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
        const rawContent = await userRes.json();
        userdataSha = rawContent.sha;
        globalUserData = JSON.parse(b64DecodeUnicode(rawContent.content));
        
        if (!globalUserData[currentProfile]) {
            alert(`Profilo ${currentProfile} non trovato nei dati. Torna alla home per forzare la migrazione.`);
            window.location.href = 'index.html';
            return;
        }

        userData = globalUserData[currentProfile];
        
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

function filterList() {
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    renderList();
}

async function changeRating(itemId) {
    const currentEntry = userData[currentTab].ratings[itemId];
    const isPartialStr = currentEntry.partial ? " (Attualmente segnato come ABBANDONATO/A METÀ)\n" : "\n";
    
    const newRatingStr = prompt(`Inserisci il nuovo voto per questo titolo (da 1 a 5):\nAttuale: ${currentEntry.rating}⭐${isPartialStr}`, currentEntry.rating);
    
    if (newRatingStr === null) return; // l'utente ha premuto annulla
    
    const newRating = parseInt(newRatingStr);
    if (isNaN(newRating) || newRating < 1 || newRating > 5) {
        alert("Inserisci un numero valido da 1 a 5.");
        return;
    }

    // Se stiamo modificando la serie, chiediamo anche se è ancora abbandonata o l'ha finita
    let newPartial = currentEntry.partial || false;
    if(currentTab === 'tv') {
        const confirmPartial = confirm(`Hai completato la visione di questa serie?\n[OK] = Sì, l'ho finita\n[Annulla] = No, l'ho abbandonata a metà`);
        newPartial = !confirmPartial; // se preme OK, partial diventa false. Se Annulla, partial diventa true
    }

    userData[currentTab].ratings[itemId].rating = newRating;
    userData[currentTab].ratings[itemId].partial = newPartial;
    userData[currentTab].ratings[itemId].timestamp = new Date().toISOString();
    
    renderList();
    await saveUserData();
}

async function saveUserData() {
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
                message: `Update rating/list for ${currentProfile}`,
                content: content,
                sha: userdataSha
            })
        });
        
        if (!response.ok) throw new Error('Errore nel salvataggio su GitHub');
        const data = await response.json();
        userdataSha = data.content.sha;
    } catch (err) {
        console.error("Salvataggio fallito:", err);
        alert("Si è verificato un errore nel salvataggio del nuovo voto su GitHub.");
    }
}

function renderList() {
    const listOutput = document.getElementById('list-output');
    const emptyState = document.getElementById('empty-state');
    const emptyText = document.getElementById('empty-text');
    listOutput.innerHTML = '';
    
    if (currentView === 'history') {
        const ratings = userData[currentTab]?.ratings || {};
        const items = catalogData[currentTab] || [];
        
        let ratedItems = Object.keys(ratings)
            .filter(id => ratings[id].seen === true)
            .map(id => {
                const catalogItem = items.find(i => i.id == id);
                return {
                    ...catalogItem,
                    rating: ratings[id].rating,
                    partial: ratings[id].partial,
                    timestamp: ratings[id].timestamp
                };
            })
            .filter(i => i.title);
            
        if (searchQuery) {
            ratedItems = ratedItems.filter(item => 
                item.title.toLowerCase().includes(searchQuery) ||
                (item.genres && item.genres.some(g => g.toLowerCase().includes(searchQuery))) ||
                (item.platforms && item.platforms.some(p => p.toLowerCase().includes(searchQuery))) ||
                (item.year && item.year.toString().includes(searchQuery))
            );
        }

        ratedItems.sort((a, b) => b.rating - a.rating || new Date(b.timestamp) - new Date(a.timestamp));

        if (ratedItems.length === 0) {
            emptyState.style.display = 'block';
            emptyText.innerHTML = searchQuery ? "Nessun titolo trovato per la tua ricerca." : "Non hai ancora valutato nessun titolo in questa categoria.";
            return;
        }

        emptyState.style.display = 'none';
        
        ratedItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const poster = item.poster || 'https://via.placeholder.com/60x90?text=No+Poster';
            
            // Etichetta "Abbandonata" se salvata come partial
            const partialBadge = item.partial ? `<span style="background: rgba(255,152,0,0.2); color: #ffb74d; font-size:0.7em; padding: 2px 6px; border-radius: 4px; border: 1px solid #ff9800; margin-left: 8px; vertical-align: middle;">⏳ A metà</span>` : '';
            
            div.innerHTML = `
                <img src="${poster}" alt="${item.title}">
                <div class="list-item-content">
                    <h3>${item.title} (${item.year}) ${partialBadge}</h3>
                    <p>${(item.genres || []).join(', ')}</p>
                    <p style="font-size:0.8em; margin-top:4px;">Su: ${(item.platforms || []).join(', ')}</p>
                </div>
                <div class="list-item-rating editable-rating" onclick="changeRating(${item.id})" title="Clicca per modificare il voto">
                    ${item.rating} ⭐
                </div>
            `;
            listOutput.appendChild(div);
        });

    } else if (currentView === 'watchlist') {
        let watchlist = userData[currentTab]?.watchlist || [];
        
        if (searchQuery) {
            watchlist = watchlist.filter(item => 
                item.title.toLowerCase().includes(searchQuery) ||
                item.reason.toLowerCase().includes(searchQuery) ||
                (item.year && item.year.toString().includes(searchQuery))
            );
        }

        if (watchlist.length === 0) {
            emptyState.style.display = 'block';
            emptyText.innerHTML = searchQuery ? "Nessun risultato nella Watchlist." : "La tua Watchlist è vuota.<br><span style='font-size:0.7em;color:#aaa'>Chiedi a Gemini dei consigli dalla Home e salvali qui!</span>";
            return;
        }

        emptyState.style.display = 'none';
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