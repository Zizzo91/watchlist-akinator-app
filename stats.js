const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';
const GITHUB_TOKEN = localStorage.getItem('gh_pat');
const currentProfile = localStorage.getItem('active_profile');

let catalogData = { movies: [], tv: [] };
let userData = null;

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!GITHUB_TOKEN || !currentProfile) {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('profile-name-header').innerText = `📊 Statistiche di ${currentProfile}`;
    await loadData();
});

async function loadData() {
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
        const globalUserData = JSON.parse(b64DecodeUnicode((await userRes.json()).content));
        
        userData = globalUserData[currentProfile];
        if (!userData) throw new Error("Profilo non trovato");

        processAndRenderStats();

    } catch (err) {
        console.error(err);
        alert("Errore nel caricamento dei dati.");
    }
}

function processAndRenderStats() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('stats-content').style.display = 'grid';

    const movieRatings = userData.movies?.ratings || {};
    const tvRatings = userData.tv?.ratings || {};

    const seenMovies = Object.values(movieRatings).filter(r => r.seen && !r.partial);
    const seenTv = Object.values(tvRatings).filter(r => r.seen && !r.partial);
    const abandonedTv = Object.values(tvRatings).filter(r => r.seen && r.partial);

    document.getElementById('total-movies').innerText = seenMovies.length;
    document.getElementById('total-tv').innerText = seenTv.length;
    document.getElementById('total-abandoned').innerText = abandonedTv.length;

    const allSeen = [
        ...Object.keys(movieRatings).filter(id => movieRatings[id].seen).map(id => ({ id, type: 'movies', data: movieRatings[id] })),
        ...Object.keys(tvRatings).filter(id => tvRatings[id].seen).map(id => ({ id, type: 'tv', data: tvRatings[id] }))
    ];

    // 1. Distribuzione Voti
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allSeen.forEach(item => {
        if (!item.data.partial && item.data.rating >= 1 && item.data.rating <= 5) {
            ratingCounts[item.data.rating]++;
        }
    });

    new Chart(document.getElementById('ratingsChart'), {
        type: 'bar',
        data: {
            labels: ['1⭐', '2⭐', '3⭐', '4⭐', '5⭐'],
            datasets: [{
                label: 'Numero di titoli',
                data: [ratingCounts[1], ratingCounts[2], ratingCounts[3], ratingCounts[4], ratingCounts[5]],
                backgroundColor: ['#ff5252', '#ff9800', '#ffeb3b', '#8bc34a', '#4caf50'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { color: '#aaa' } }, x: { ticks: { color: '#aaa' } } }
        }
    });

    // 2. Generi Preferiti (voto >= 4)
    const genreCounts = {};
    allSeen.forEach(item => {
        if (!item.data.partial && item.data.rating >= 4) {
            const catItem = catalogData[item.type].find(i => i.id == item.id);
            if (catItem && catItem.genres) {
                catItem.genres.forEach(g => {
                    genreCounts[g] = (genreCounts[g] || 0) + 1;
                });
            }
        }
    });

    const sortedGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]).slice(0, 5);
    const topGenreData = sortedGenres.map(g => genreCounts[g]);

    new Chart(document.getElementById('genresChart'), {
        type: 'radar',
        data: {
            labels: sortedGenres.length > 0 ? sortedGenres : ['Nessun dato'],
            datasets: [{
                data: sortedGenres.length > 0 ? topGenreData : [1],
                backgroundColor: 'rgba(138, 43, 226, 0.4)',
                borderColor: '#8a2be2',
                pointBackgroundColor: '#e50914'
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { color: '#aaa' } } },
            scales: { r: { ticks: { display: false }, grid: { color: '#444' }, angleLines: { color: '#444' }, pointLabels: { color: '#ddd' } } }
        }
    });

    // 3. Piattaforme (tutti i visti)
    const platformCounts = {};
    allSeen.forEach(item => {
        const catItem = catalogData[item.type].find(i => i.id == item.id);
        if (catItem && catItem.platforms) {
            catItem.platforms.forEach(p => {
                if (p !== 'Aggiunta Manuale' && p !== 'Da Watchlist') {
                    platformCounts[p] = (platformCounts[p] || 0) + 1;
                }
            });
        }
    });

    const sortedPlatforms = Object.keys(platformCounts).sort((a, b) => platformCounts[b] - platformCounts[a]);
    
    new Chart(document.getElementById('platformsChart'), {
        type: 'doughnut',
        data: {
            labels: sortedPlatforms,
            datasets: [{
                data: sortedPlatforms.map(p => platformCounts[p]),
                backgroundColor: ['#e50914', '#00a8e1', '#0025a9', '#ffb74d', '#8bc34a', '#ff5252'],
                borderWidth: 1,
                borderColor: '#141414'
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#aaa' } } }
        }
    });
}