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
let filterGenre = '';
let filterPlatform = '';
let filterRating = '';

function b64DecodeUnicode(str) { return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); }
function b64EncodeUnicode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))); }

document.addEventListener('DOMContentLoaded', async () => {
    if (!GITHUB_TOKEN || !currentProfile) return window.location.href = 'index.html';
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
        const catalogRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/catalog.json`, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }, cache: 'no-store' });
        catalogData = JSON.parse(b64DecodeUnicode((await catalogRes.json()).content));

        const userRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }, cache: 'no-store' });
        const rawContent = await userRes.json();
        userdataSha = rawContent.sha;
        globalUserData = JSON.parse(b64DecodeUnicode(rawContent.content));
        
        userData = globalUserData[currentProfile];
        if(!userData.movies.watchlist) userData.movies.watchlist = [];
        if(!userData.tv.watchlist) userData.tv.watchlist = [];
        if(!userData.movies.manual_queue) userData.movies.manual_queue = [];
        if(!userData.tv.manual_queue) userData.tv.manual_queue = [];
        
        updateFiltersUI();
        populateGenreDropdown();
        renderList();
    } catch (err) {
        console.error(err);
        alert("Errore nel caricamento dei dati da GitHub.");
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function updateFiltersUI() {
    const ratingSelect = document.getElementById('filter-rating');
    const currentVal = ratingSelect.value;
    ratingSelect.innerHTML = `
        <option value="">Tutti i Voti/Stati</option>
        <option value="5">⭐⭐⭐⭐⭐</option>
        <option value="4">⭐⭐⭐⭐</option>
        <option value="3">⭐⭐⭐</option>
        <option value="2">⭐⭐</option>
        <option value="1">⭐</option>
        <option value="partial">⏳ Abbandonati</option>
        ${currentTab === 'tv' ? '<option value="ongoing">🔄 In Corso (Attesa)</option>' : ''}
    `;
    if (Array.from(ratingSelect.options).some(opt => opt.value === currentVal)) {
        ratingSelect.value = currentVal;
    } else {
        ratingSelect.value = '';
        filterRating = '';
    }
}

function populateGenreDropdown() {
    const ratings = userData[currentTab]?.ratings || {};
    const items = catalogData[currentTab] || [];
    const uniqueGenres = new Set();
    Object.keys(ratings).forEach(id => {
        if (ratings[id].seen) {
            const catalogItem = items.find(i => i.id == id);
            if (catalogItem && catalogItem.genres) catalogItem.genres.forEach(g => uniqueGenres.add(g));
        }
    });
    const genreSelect = document.getElementById('filter-genre');
    genreSelect.innerHTML = '<option value="">Tutti i Generi</option>';
    Array.from(uniqueGenres).sort().forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.innerText = g; genreSelect.appendChild(opt);
    });
}

function setTab(tab) {
    currentTab = tab;
    document.getElementById('btn-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('btn-tv').classList.toggle('active', tab === 'tv');
    document.getElementById('search-input').value = '';
    document.getElementById('filter-genre').value = '';
    document.getElementById('filter-platform').value = '';
    
    updateFiltersUI();
    filterList(); 
    populateGenreDropdown();
}

function setView(view) {
    currentView = view;
    document.getElementById('btn-history').classList.toggle('active', view === 'history');
    document.getElementById('btn-watchlist').classList.toggle('active', view === 'watchlist');
    document.getElementById('filters-row').style.display = view === 'watchlist' ? 'none' : 'flex';
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
        const title = prompt(`STORICO VOTATI:\nInserisci il NOME ESATTO ${typeLabel} che vuoi aggiungere:`);
        if (!title || !title.trim()) return;
        const ratingStr = prompt(`Che voto dai a "${title.trim()}"? (da 1 a 5)`);
        if (!ratingStr) return;
        const rating = parseInt(ratingStr);
        if (isNaN(rating) || rating < 1 || rating > 5) return alert("Devi inserire un numero tra 1 e 5.");
        
        let isPartial = false;
        let isOngoing = false;
        
        if (currentTab === 'tv') {
            isPartial = confirm(`Hai ABBANDONATO "${title.trim()}" a metà?\n[OK] = Sì, l'ho abbandonata\n[Annulla] = No, l'ho finita/sono in pari`);
            if (!isPartial) {
                isOngoing = confirm(`La serie "${title.trim()}" è IN CORSO (sei in attesa di nuove stagioni)?\n[OK] = Sì, attendo altre stagioni\n[Annulla] = No, è conclusa definitivamente`);
            }
        }
        
        userData[currentTab].manual_queue.push({ 
            title: title.trim(), 
            rating: rating, 
            partial: isPartial,
            ongoing: isOngoing,
            addedAt: new Date().toISOString() 
        });
        
        renderList(); await saveUserData();
        alert(`"${title.trim()}" inserito nello storico!`);
    } else {
        const title = prompt(`DA VEDERE (WATCHLIST):\nInserisci il NOME ESATTO ${typeLabel} che vuoi aggiungere:`);
        if (!title || !title.trim()) return;
        userData[currentTab].watchlist.push({ title: title.trim(), reason: "Aggiunto manualmente.", addedAt: new Date().toISOString() });
        renderList(); await saveUserData();
        alert(`"${title.trim()}" inserito nella Watchlist!`);
    }
}

async function deleteFromHistory(itemId, title) {
    if (!confirm(`Vuoi ELIMINARE "${title}" dallo Storico?`)) return;
    delete userData[currentTab].ratings[itemId];
    userData[currentTab].asked = userData[currentTab].asked.filter(id => id !== itemId);
    renderList(); await saveUserData();
}

async function deleteFromWatchlist(title) {
    if (!confirm(`Vuoi RIMUOVERE "${title}" dalla Watchlist?`)) return;
    userData[currentTab].watchlist = userData[currentTab].watchlist.filter(item => item.title !== title);
    renderList(); await saveUserData();
}

async function markWatchlistAsSeen(title, itemId) {
    const ratingStr = prompt(`Hai visto "${title}".\nChe voto gli dai? (da 1 a 5)`);
    if (!ratingStr) return;
    const rating = parseInt(ratingStr);
    if (isNaN(rating) || rating < 1 || rating > 5) return alert("Inserisci un numero valido da 1 a 5.");
    
    let isPartial = false;
    let isOngoing = false;
    if(currentTab === 'tv') {
        isPartial = confirm(`Hai ABBANDONATO la visione a metà?\n[OK] = Sì, abbandonata\n[Annulla] = No, finita/in pari`);
        if(!isPartial) {
            isOngoing = confirm(`La serie è IN CORSO (attendi nuove stagioni)?\n[OK] = Sì\n[Annulla] = No, conclusa`);
        }
    }
    
    userData[currentTab].watchlist = userData[currentTab].watchlist.filter(item => item.title !== title);
    if (itemId) {
        if (!userData[currentTab].ratings) userData[currentTab].ratings = {};
        userData[currentTab].ratings[itemId] = { rating: rating, seen: true, partial: isPartial, ongoing: isOngoing, timestamp: new Date().toISOString() };
        if (!userData[currentTab].asked.includes(itemId)) userData[currentTab].asked.push(itemId);
    } else {
        userData[currentTab].manual_queue.push({ title: title, rating: rating, partial: isPartial, ongoing: isOngoing, addedAt: new Date().toISOString() });
    }
    renderList(); await saveUserData();
    alert(`"${title}" spostato nello Storico con voto ${rating}⭐!`);
}

async function changeRating(itemId) {
    const currentEntry = userData[currentTab].ratings[itemId];
    const isPartialStr = currentEntry.partial ? " (A METÀ)\n" : "\n";
    const newRatingStr = prompt(`Nuovo voto per questo titolo (da 1 a 5):\nAttuale: ${currentEntry.rating}⭐${isPartialStr}`, currentEntry.rating);
    if (newRatingStr === null) return; 
    const newRating = parseInt(newRatingStr);
    if (isNaN(newRating) || newRating < 1 || newRating > 5) return alert("Valore non valido.");
    
    userData[currentTab].ratings[itemId].rating = newRating;
    userData[currentTab].ratings[itemId].timestamp = new Date().toISOString();
    renderList(); await saveUserData();
}

async function togglePartialStatus(itemId) {
    const item = userData[currentTab].ratings[itemId];
    if(!item) return;
    
    if (item.partial) {
        item.partial = false;
        alert("Stato aggiornato: Serie segnata come COMPLETATA / IN PARI! ✅");
    } else {
        item.partial = true;
        item.ongoing = false; 
        alert("Stato aggiornato: Serie segnata come ABBANDONATA / A METÀ! ⏳");
    }
    item.timestamp = new Date().toISOString();
    renderList(); await saveUserData();
}

async function toggleOngoingStatus(itemId) {
    const item = userData[currentTab].ratings[itemId];
    if(!item) return;
    
    item.ongoing = !item.ongoing;
    if (item.ongoing) {
        item.partial = false; 
        alert("Stato aggiornato: Serie segnata come 'IN CORSO'. Sei in pari e attendi nuove stagioni! 🔄");
    } else {
        alert("Stato aggiornato: Serie segnata come CONCLUSIVA/FINITA! 🎬");
    }
    item.timestamp = new Date().toISOString();
    renderList(); await saveUserData();
}

async function saveUserData() {
    const content = b64EncodeUnicode(JSON.stringify(globalUserData, null, 2));
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/userdata.json`, {
            method: 'PUT', headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Aggiornamento da List`, content: content, sha: userdataSha })
        });
        if (!res.ok) throw new Error('Errore GitHub');
        userdataSha = (await res.json()).content.sha;
    } catch (err) { console.error(err); alert("Errore nel salvataggio."); }
}

function copyTitle(title) {
    navigator.clipboard.writeText(title).then(() => {
        const toast = document.getElementById("toast");
        toast.innerText = `"${title}" copiato!`;
        toast.className = "show";
        setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
    });
}

function renderList() {
    const listOutput = document.getElementById('list-output');
    const emptyState = document.getElementById('empty-state');
    listOutput.innerHTML = '';
    const items = catalogData[currentTab] || [];
    
    if (currentView === 'history') {
        const ratings = userData[currentTab]?.ratings || {};
        let ratedItems = Object.keys(ratings).filter(id => ratings[id].seen === true).map(id => {
            const catItem = items.find(i => i.id == id);
            return { ...catItem, id: id, rating: ratings[id].rating, partial: ratings[id].partial, ongoing: ratings[id].ongoing, timestamp: ratings[id].timestamp };
        }).filter(i => i.title); 
            
        let manualItems = (userData[currentTab]?.manual_queue || []).map(item => ({
            id: 'manual', title: item.title, year: '⏳ Ricerca...', genres: ['In attesa'], platforms: [], rating: item.rating, partial: item.partial || false, ongoing: item.ongoing || false, poster: 'https://via.placeholder.com/60x90/333333/ffffff?text=%E2%8F%B3', isManual: true, timestamp: item.addedAt
        }));

        if (searchQuery) {
            ratedItems = ratedItems.filter(item => item.title.toLowerCase().includes(searchQuery));
            manualItems = manualItems.filter(item => item.title.toLowerCase().includes(searchQuery));
        }
        if (filterGenre) ratedItems = ratedItems.filter(item => item.genres && item.genres.includes(filterGenre));
        if (filterPlatform) ratedItems = ratedItems.filter(item => item.platforms && item.platforms.includes(filterPlatform));
        if (filterRating) {
            if (filterRating === 'partial') {
                ratedItems = ratedItems.filter(item => item.partial === true);
                manualItems = manualItems.filter(item => item.partial === true);
            }
            else if (filterRating === 'ongoing') {
                ratedItems = ratedItems.filter(item => item.ongoing === true);
                manualItems = manualItems.filter(item => item.ongoing === true);
            }
            else {
                const r = parseInt(filterRating);
                ratedItems = ratedItems.filter(item => item.rating === r && !item.partial && !item.ongoing);
                manualItems = manualItems.filter(item => item.rating === r && !item.partial && !item.ongoing);
            }
        }

        ratedItems.sort((a, b) => b.rating - a.rating || new Date(b.timestamp) - new Date(a.timestamp));
        const combinedList = [...manualItems, ...ratedItems];

        if (combinedList.length === 0) { emptyState.style.display = 'block'; return; }
        emptyState.style.display = 'none';
        
        combinedList.forEach(item => {
            const div = document.createElement('div'); div.className = 'list-item';
            const poster = item.poster || 'https://via.placeholder.com/60x90?text=No+Poster';
            
            const partialBadge = item.partial ? `<span style="background: rgba(255,152,0,0.2); color: #ffb74d; font-size:0.7em; padding: 2px 4px; border-radius: 4px; margin-left: 4px;">⏳ Abbandonata</span>` : '';
            const ongoingBadge = item.ongoing ? `<span style="background: rgba(0, 168, 225, 0.2); color: #00a8e1; font-size:0.7em; padding: 2px 4px; border-radius: 4px; margin-left: 4px;">🔄 In Corso</span>` : '';
            
            const ratingClick = item.isManual ? '' : `onclick="changeRating('${item.id}')"`;
            const escapedTitle = item.title.replace(/'/g, "\\'");
            
            const toggleOngoingBtn = (currentTab === 'tv' && !item.isManual) 
                ? `<button class="action-icon" onclick="toggleOngoingStatus('${item.id}')" title="${item.ongoing ? 'Segna come Conclusa/Finita' : 'Segna come In Corso (Attesa nuove stagioni)'}" style="color: ${item.ongoing ? '#00a8e1' : '#aaa'};">${item.ongoing ? '🔄' : '🎬'}</button>`
                : '';

            const togglePartialBtn = (currentTab === 'tv' && !item.isManual) 
                ? `<button class="action-icon" onclick="togglePartialStatus('${item.id}')" title="${item.partial ? 'Segna come Vista Tutta/In Pari' : 'Segna come Abbandonata a metà'}" style="color: ${item.partial ? '#4caf50' : '#ff9800'};">${item.partial ? '✅' : '⏳'}</button>`
                : '';

            const deleteBtnHtml = !item.isManual ? `<button class="action-icon" style="color:#ff5252;" onclick="deleteFromHistory('${item.id}', '${escapedTitle}')" title="Elimina dallo Storico">✖</button>` : '';

            const searchTrailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' ' + (item.year!=='⏳ Ricerca...' ? item.year : '') + ' trailer ita')}`;
            const trailerHtml = !item.isManual ? `<a class="trailer-link" href="${searchTrailerUrl}" target="_blank">▶️ Trailer</a>` : '';

            div.innerHTML = `
                <img src="${poster}" alt="Poster" onclick="copyTitle('${escapedTitle}')">
                <div class="list-item-content">
                    <h3>${item.title} ${item.year !== '⏳ Ricerca...' ? `(${item.year})` : ''} ${partialBadge} ${ongoingBadge}</h3>
                    <p style="color: ${item.isManual ? '#ffb74d' : '#aaa'}">${(item.genres || []).join(', ')}</p>
                    <p style="font-size:0.8em; margin-top:2px; color:#888;">${item.platforms && item.platforms.length > 0 ? 'Su: ' + item.platforms.join(', ') : item.year}</p>
                    <div>${trailerHtml}</div>
                </div>
                <div class="list-item-actions">
                    <div class="list-item-rating" ${ratingClick} title="Modifica Voto">${item.rating} ⭐</div>
                    <div style="display:flex; gap: 3px; margin-top: auto;">
                        ${toggleOngoingBtn}
                        ${togglePartialBtn}
                        ${deleteBtnHtml}
                    </div>
                </div>
            `;
            listOutput.appendChild(div);
        });

    } else if (currentView === 'watchlist') {
        let watchlist = userData[currentTab]?.watchlist || [];
        if (searchQuery) watchlist = watchlist.filter(item => item.title.toLowerCase().includes(searchQuery) || item.reason.toLowerCase().includes(searchQuery));
        if (watchlist.length === 0) { emptyState.style.display = 'block'; return; }
        emptyState.style.display = 'none';
        
        [...watchlist].reverse().forEach(item => {
            const div = document.createElement('div'); div.className = 'list-item'; 
            let catItem = item.id ? items.find(i => i.id == item.id) : items.find(i => i.title.toLowerCase() === item.title.toLowerCase());
            const poster = catItem && catItem.poster ? catItem.poster : 'https://via.placeholder.com/60x90/333333/ffffff?text=%E2%8F%B3';
            const year = catItem && catItem.year ? catItem.year : (item.year || '⏳');
            const genres = catItem && catItem.genres ? catItem.genres.join(', ') : (!catItem ? '⏳ In attesa...' : '');
            const platforms = catItem && catItem.platforms ? catItem.platforms.join(', ') : '';
            const escapedTitle = item.title.replace(/'/g, "\\'");
            const idParam = catItem ? `'${catItem.id}'` : null;

            const searchTrailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' ' + (year!=='⏳' ? year : '') + ' trailer ita')}`;

            div.innerHTML = `
                <img src="${poster}" alt="Poster" style="align-self: flex-start;" onclick="copyTitle('${escapedTitle}')">
                <div class="list-item-content">
                    <h3 style="color: var(--accent-color);">${item.title} ${year !== '⏳' ? `(${year})` : ''}</h3>
                    <p style="color: ${!catItem ? '#ffb74d' : '#aaa'}; font-size: 0.8em; margin-bottom: 5px;">${genres}</p>
                    <p style="color: #ddd; font-style: italic; font-size: 0.9em; white-space: normal; line-height: 1.3; flex-grow: 1;">"${item.reason}"</p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                        <span style="font-size:0.8em; color:#888;">${platforms ? `Su: ${platforms}` : ''}</span>
                        <a class="trailer-link" href="${searchTrailerUrl}" target="_blank" style="margin:0;">▶️ Trailer</a>
                    </div>
                </div>
                <div class="list-item-actions">
                    <button class="mark-seen-btn" onclick="markWatchlistAsSeen('${escapedTitle}', ${idParam})">L'ho Visto!</button>
                    <button class="action-icon" style="color:#ff5252;" onclick="deleteFromWatchlist('${escapedTitle}')" title="Rimuovi">✖</button>
                </div>
            `;
            listOutput.appendChild(div);
        });
    }
}