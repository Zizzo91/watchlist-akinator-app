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

// Variabili per i filtri
let searchQuery = '';
let filterGenre = '';
let filterPlatform = '';
let filterRating = '';

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
    document.getElementById('search-container').style.display = 'flex';
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
        if(!userData.movies.manual_queue) userData.movies.manual_queue = [];
        if(!userData.tv.manual_queue) userData.tv.manual_queue = [];
        
        populateGenreDropdown();
        renderList();

    } catch (err) {
        console.error(err);
        alert("Errore nel caricamento dei dati da GitHub.");
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function populateGenreDropdown() {
    const ratings = userData[currentTab]?.ratings || {};
    const items = catalogData[currentTab] || [];
    
    const uniqueGenres = new Set();
    
    Object.keys(ratings).forEach(id => {
        if (ratings[id].seen) {
            const catalogItem = items.find(i => i.id == id);
            if (catalogItem && catalogItem.genres) {
                catalogItem.genres.forEach(g => uniqueGenres.add(g));
            }
        }
    });

    const genreSelect = document.getElementById('filter-genre');
    genreSelect.innerHTML = '<option value="">Tutti i Generi</option>';
    
    Array.from(uniqueGenres).sort().forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.innerText = g;
        genreSelect.appendChild(opt);
    });
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    
    document.getElementById('search-input').value = '';
    document.getElementById('filter-genre').value = '';
    document.getElementById('filter-platform').value = '';
    document.getElementById('filter-rating').value = '';
    filterList(); 
    populateGenreDropdown();
}

function setView(view) {
    currentView = view;
    document.getElementById('btn-history').classList.toggle('active', view === 'history');
    document.getElementById('btn-watchlist').classList.toggle('active', view === 'watchlist');
    
    if(view === 'watchlist') {
        document.getElementById('filters-row').style.display = 'none';
    } else {
        document.getElementById('filters-row').style.display = 'flex';
    }
    
    renderList();
}

function filterList() {
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    filterGenre = document.getElementById('filter-genre').value;
    filterPlatform = document.getElementById('filter-platform').value;
    filterRating = document.getElementById('filter-rating').value;
    renderList();
}

async function askManualAdd() {
    const typeLabel = currentTab === 'movies' ? 'del Film' : 'della Serie TV';
    
    if (currentView === 'history') {
        const title = prompt(`STORICO VOTATI:\nInserisci il NOME ESATTO ${typeLabel} che vuoi aggiungere manualmente:`);
        if (!title || !title.trim()) return;

        const ratingStr = prompt(`Che voto dai a "${title.trim()}"? (da 1 a 5)`);
        if (!ratingStr) return;

        const rating = parseInt(ratingStr);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            alert("Devi inserire un numero tra 1 e 5.");
            return;
        }

        if (!userData[currentTab].manual_queue) userData[currentTab].manual_queue = [];

        userData[currentTab].manual_queue.push({
            title: title.trim(),
            rating: rating,
            addedAt: new Date().toISOString()
        });

        renderList(); 
        await saveUserData();
        alert(`"${title.trim()}" inserito in coda con successo!\n\nL'algoritmo andrà a cercare il poster e le info ufficiali su TMDB stanotte.`);
        
    } else {
        const title = prompt(`DA VEDERE (WATCHLIST):\nInserisci il NOME ESATTO ${typeLabel} che vuoi inserire nella tua lista dei desideri:`);
        if (!title || !title.trim()) return;

        if (!userData[currentTab].watchlist) userData[currentTab].watchlist = [];

        userData[currentTab].watchlist.push({
            title: title.trim(),
            reason: "Aggiunto manualmente.",
            addedAt: new Date().toISOString()
        });

        renderList(); 
        await saveUserData();
        alert(`"${title.trim()}" inserito nella tua Watchlist!\n\nL'algoritmo andrà a cercare il poster e i dettagli su TMDB stanotte.`);
    }
}

async function deleteFromHistory(itemId, title) {
    if (!confirm(`Sei sicuro di voler ELIMINARE "${title}" dal tuo Storico Votati?\nL'intelligenza artificiale non terrà più conto di questo voto.`)) {
        return;
    }
    
    delete userData[currentTab].ratings[itemId];
    userData[currentTab].asked = userData[currentTab].asked.filter(id => id !== itemId);
    
    renderList();
    await saveUserData();
}

async function deleteFromWatchlist(title) {
    if (!confirm(`Sei sicuro di voler RIMUOVERE "${title}" dalla tua Watchlist?`)) {
        return;
    }
    
    userData[currentTab].watchlist = userData[currentTab].watchlist.filter(item => item.title !== title);
    
    renderList();
    await saveUserData();
}

async function markWatchlistAsSeen(title, itemId) {
    const ratingStr = prompt(`Ottimo! Hai visto "${title}".\nChe voto gli dai? (da 1 a 5)`);
    if (!ratingStr) return;
    
    const rating = parseInt(ratingStr);
    if (isNaN(rating) || rating < 1 || rating > 5) {
        alert("Devi inserire un numero tra 1 e 5.");
        return;
    }

    let isPartial = false;
    if(currentTab === 'tv') {
        const confirmPartial = confirm(`Hai completato la visione di questa serie?\n[OK] = Sì, l'ho finita\n[Annulla] = No, l'ho abbandonata a metà`);
        isPartial = !confirmPartial; 
    }
    
    userData[currentTab].watchlist = userData[currentTab].watchlist.filter(item => item.title !== title);
    
    if (itemId) {
        if (!userData[currentTab].ratings) userData[currentTab].ratings = {};
        userData[currentTab].ratings[itemId] = {
            rating: rating,
            seen: true,
            partial: isPartial,
            timestamp: new Date().toISOString()
        };
        if (!userData[currentTab].asked.includes(itemId)) {
            userData[currentTab].asked.push(itemId);
        }
    } else {
        if (!userData[currentTab].manual_queue) userData[currentTab].manual_queue = [];
        userData[currentTab].manual_queue.push({
            title: title,
            rating: rating,
            addedAt: new Date().toISOString()
        });
    }

    renderList();
    await saveUserData();
    alert(`"${title}" spostato con successo nello Storico con voto ${rating}⭐!`);
}

async function changeRating(itemId) {
    const currentEntry = userData[currentTab].ratings[itemId];
    const isPartialStr = currentEntry.partial ? " (Attualmente segnato come ABBANDONATO/A METÀ)\n" : "\n";
    
    const newRatingStr = prompt(`Inserisci il nuovo voto per questo titolo (da 1 a 5):\nAttuale: ${currentEntry.rating}⭐${isPartialStr}`, currentEntry.rating);
    
    if (newRatingStr === null) return; 
    
    const newRating = parseInt(newRatingStr);
    if (isNaN(newRating) || newRating < 1 || newRating > 5) {
        alert("Inserisci un numero valido da 1 a 5.");
        return;
    }

    let newPartial = currentEntry.partial || false;
    if(currentTab === 'tv') {
        const confirmPartial = confirm(`Hai completato la visione di questa serie?\n[OK] = Sì, l'ho finita\n[Annulla] = No, l'ho abbandonata a metà`);
        newPartial = !confirmPartial; 
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
                message: `Update user data / queue for ${currentProfile}`,
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

function copyTitle(title) {
    navigator.clipboard.writeText(title).then(() => {
        const toast = document.getElementById("toast");
        toast.innerText = `"${title}" copiato negli appunti!`;
        toast.className = "show";
        setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
    });
}

function renderList() {
    const listOutput = document.getElementById('list-output');
    const emptyState = document.getElementById('empty-state');
    const emptyText = document.getElementById('empty-text');
    listOutput.innerHTML = '';
    const items = catalogData[currentTab] || [];
    
    if (currentView === 'history') {
        const ratings = userData[currentTab]?.ratings || {};
        
        let ratedItems = Object.keys(ratings)
            .filter(id => ratings[id].seen === true)
            .map(id => {
                const catalogItem = items.find(i => i.id == id);
                return {
                    ...catalogItem,
                    id: id,
                    rating: ratings[id].rating,
                    partial: ratings[id].partial,
                    timestamp: ratings[id].timestamp
                };
            })
            .filter(i => i.title); 
            
        let manualItems = (userData[currentTab]?.manual_queue || []).map(item => ({
            id: 'manual', 
            title: item.title,
            year: '⏳ Ricerca...',
            genres: ['In attesa del Server'],
            platforms: [],
            rating: item.rating,
            poster: 'https://via.placeholder.com/60x90/333333/ffffff?text=%E2%8F%B3',
            isManual: true,
            timestamp: item.addedAt
        }));

        if (searchQuery) {
            ratedItems = ratedItems.filter(item => item.title.toLowerCase().includes(searchQuery));
            manualItems = manualItems.filter(item => item.title.toLowerCase().includes(searchQuery));
        }

        if (filterGenre) {
            ratedItems = ratedItems.filter(item => item.genres && item.genres.includes(filterGenre));
            manualItems = manualItems.filter(item => false); 
        }

        if (filterPlatform) {
            ratedItems = ratedItems.filter(item => item.platforms && item.platforms.includes(filterPlatform));
            manualItems = manualItems.filter(item => false); 
        }

        if (filterRating) {
            if (filterRating === 'partial') {
                ratedItems = ratedItems.filter(item => item.partial === true);
            } else {
                const r = parseInt(filterRating);
                ratedItems = ratedItems.filter(item => item.rating === r && !item.partial);
                manualItems = manualItems.filter(item => item.rating === r);
            }
        }

        ratedItems.sort((a, b) => b.rating - a.rating || new Date(b.timestamp) - new Date(a.timestamp));
        
        const combinedList = [...manualItems, ...ratedItems];

        if (combinedList.length === 0) {
            emptyState.style.display = 'block';
            emptyText.innerHTML = "Nessun titolo corrisponde ai filtri impostati.";
            return;
        }

        emptyState.style.display = 'none';
        
        combinedList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.title = item.title; 
            const poster = item.poster || 'https://via.placeholder.com/60x90?text=No+Poster';
            
            const partialBadge = item.partial ? `<span style="background: rgba(255,152,0,0.2); color: #ffb74d; font-size:0.7em; padding: 2px 4px; border-radius: 4px; border: 1px solid #ff9800; margin-left: 4px; vertical-align: middle;">⏳ A metà</span>` : '';
            
            const ratingClick = item.isManual ? '' : `onclick="changeRating(${item.id})"`;
            const ratingClass = item.isManual ? '' : 'editable-rating';
            const ratingTitle = item.isManual ? 'In attesa di scansione...' : 'Clicca per modificare il voto';
            
            const escapedTitle = item.title.replace(/'/g, "\\'");
            const deleteBtnHtml = !item.isManual ? `<button class="delete-btn" onclick="deleteFromHistory(${item.id}, '${escapedTitle}')" title="Rimuovi dallo storico">✖</button>` : '';

            div.innerHTML = `
                <img src="${poster}" alt="Poster" onclick="copyTitle('${escapedTitle}')" title="Clicca per copiare il titolo">
                <div class="list-item-content">
                    <h3>${item.title} ${item.year !== '⏳ Ricerca...' ? `(${item.year})` : ''} ${partialBadge}</h3>
                    <p style="color: ${item.isManual ? '#ffb74d' : '#aaa'}">${(item.genres || []).join(', ')}</p>
                    <p style="font-size:0.8em; margin-top:4px; color:#888;">${item.platforms && item.platforms.length > 0 ? 'Su: ' + item.platforms.join(', ') : item.year}</p>
                </div>
                <div class="list-item-actions">
                    <div class="list-item-rating ${ratingClass}" ${ratingClick} title="${ratingTitle}">
                        ${item.rating} ⭐
                    </div>
                    ${deleteBtnHtml}
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
            
            let catItem = null;
            if (item.id) {
                catItem = items.find(i => i.id == item.id);
            } else {
                catItem = items.find(i => i.title.toLowerCase() === item.title.toLowerCase());
            }

            const isPending = !catItem;
            const poster = catItem && catItem.poster ? catItem.poster : 'https://via.placeholder.com/60x90/333333/ffffff?text=%E2%8F%B3';
            const year = catItem && catItem.year ? catItem.year : (item.year || '⏳');
            const genres = catItem && catItem.genres ? catItem.genres.join(', ') : (isPending ? '⏳ In attesa del Server...' : '');
            const platforms = catItem && catItem.platforms ? catItem.platforms.join(', ') : '';
            
            const escapedTitle = item.title.replace(/'/g, "\\'");
            const idParam = catItem ? catItem.id : null;

            div.innerHTML = `
                <img src="${poster}" alt="Poster" style="align-self: flex-start;" onclick="copyTitle('${escapedTitle}')" title="Clicca per copiare il titolo">
                <div class="list-item-content">
                    <h3 style="color: var(--accent-color);">${item.title} ${year !== '⏳' ? `(${year})` : ''}</h3>
                    <p style="color: ${isPending ? '#ffb74d' : '#aaa'}; font-size: 0.8em; margin-bottom: 5px;">${genres}</p>
                    <p style="color: #ddd; font-style: italic; font-size: 0.9em; white-space: normal; line-height: 1.3; flex-grow: 1;">"${item.reason}"</p>
                    ${platforms ? `<p style="font-size:0.8em; margin-top:6px; margin-bottom:4px; color:#888;">Su: ${platforms}</p>` : ''}
                </div>
                <div class="list-item-actions">
                    <button class="mark-seen-btn" onclick="markWatchlistAsSeen('${escapedTitle}', ${idParam})" title="Clicca qui se hai finalmente visto questo titolo!">
                        L'ho Visto!
                    </button>
                    <button class="delete-btn" onclick="deleteFromWatchlist('${escapedTitle}')" title="Rimuovi dalla Watchlist">✖</button>
                </div>
            `;
            listOutput.appendChild(div);
        });
    }
}