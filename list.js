const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
let GITHUB_TOKEN = localStorage.getItem('gh_pat');

let catalogData = { movies: [], tv: [] };
let userData = { movies: { ratings: {}, asked: [] }, tv: { ratings: {}, asked: [] } };
let currentTab = 'movies';

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!GITHUB_TOKEN) {
        alert("Devi prima inserire il Token GitHub nella Home page!");
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('app-nav').style.display = 'flex';
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

function renderList() {
    const listOutput = document.getElementById('list-output');
    const emptyState = document.getElementById('empty-state');
    listOutput.innerHTML = '';
    
    const ratings = userData[currentTab]?.ratings || {};
    const items = catalogData[currentTab] || [];
    
    // Filtriamo solo quelli visti (hanno un rating) e li prepariamo in un array
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
        
    // Ordiniamo per voto (dal più alto al più basso) e poi per data
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
                <p style="font-size:0.8em; margin-top:4px;">Disponibile su: ${(item.platforms || []).join(', ')}</p>
            </div>
            <div class="list-item-rating">
                ${item.rating} ⭐
            </div>
        `;
        listOutput.appendChild(div);
    });
}